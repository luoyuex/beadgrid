import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { assertOrigin, endpoint, HttpError, json, rateLimit, readJson, requireUser } from '@/lib/http';
import { digestCard, newCard, serial, releaseExport, adjustMembership } from '@/lib/membership/core.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return endpoint(async () => {
    await requireUser(true);
    const query = new URL(request.url).searchParams;
    const page = Math.max(0, Math.min(10000, Number(query.get('page')) || 0));
    const skip = Math.floor(page) * 50;
    const kind = query.get('kind') || 'users';
    if (kind === 'cards') {
      const status = query.get('status');
      const where = ['UNUSED', 'REDEEMED', 'DISABLED'].includes(status || '') ? { status: status! } : {};
      return json({ items: await db.card.findMany({ where, skip, take: 50, orderBy: { batch: { createdAt: 'desc' } }, select: { id: true, suffix: true, status: true, redeemedAt: true, batch: true, redemption: { select: { userId: true } } } }) });
    }
    if (kind === 'events') return json({ items: await db.membershipEvent.findMany({ where: { userId: query.get('userId') || '' }, skip, take: 50, orderBy: { createdAt: 'desc' } }) });
    if (kind === 'audit') return json({ items: await db.audit.findMany({ skip, take: 50, orderBy: { createdAt: 'desc' } }) });
    return json({ items: await db.user.findMany({ where: query.get('email') ? { email: { contains: query.get('email')!, mode: 'insensitive' } } : {}, skip, take: 50, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, banned: true, membership: true } }) });
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const admin = await requireUser(true);
    await rateLimit(`admin:${admin.id}`, 30);
    const body = await readJson(request);
    if (!body || typeof body !== 'object') throw new HttpError(400, '请求无效');
    const audit = (action: string, targetId: string, detail: Prisma.InputJsonValue) => ({ actorId: admin.id, action, targetId, detail });
    if (body.action === 'recover') {
      const jobs = await db.exportJob.findMany({ where: { status: 'PROCESSING', leaseUntil: { lte: new Date() } }, take: 100 });
      let recovered = 0;
      for (const job of jobs) recovered += await releaseExport(db, job, true);
      await db.audit.create({ data: audit('RECOVER_EXPORTS', 'exports', { recovered }) });
      return json({ recovered });
    }
    return json(await serial(db, async (tx: Prisma.TransactionClient) => {
      const actor = await tx.user.findUnique({ where: { id: admin.id } });
      if (!actor || actor.banned || actor.role !== 'ADMIN') throw new HttpError(403, '需要管理员权限');
      if (body.action === 'cards') {
        if (!Number.isInteger(body.count) || body.count < 1 || body.count > 500 || !Number.isInteger(body.durationDays) || body.durationDays < 1 || body.durationDays > 36500) throw new HttpError(400, '数量应为 1–500，会员天数应为 1–36500');
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) throw new HttpError(400, '兑换截止时间必须在未来');
        const codes = Array.from({ length: body.count }, () => newCard());
        const batch = await tx.cardBatch.create({ data: { durationDays: body.durationDays, count: body.count, expiresAt, cards: { create: codes.map(code => ({ digest: digestCard(code, process.env.CARD_HASH_SECRET), suffix: code.slice(-5) })) } } });
        await tx.audit.create({ data: audit('CREATE_CARDS', batch.id, { count: body.count, durationDays: body.durationDays, expiresAt: expiresAt?.toISOString() || null }) });
        return { batchId: batch.id, durationDays: batch.durationDays, codes };
      }
      if (body.action === 'disable') {
        if (typeof body.cardId !== 'string') throw new HttpError(400, '请选择卡密');
        const changed = await tx.card.updateMany({ where: { id: body.cardId, status: 'UNUSED' }, data: { status: 'DISABLED' } });
        if (!changed.count) throw new HttpError(409, '仅可禁用未兑换卡密');
        await tx.audit.create({ data: audit('DISABLE_CARD', body.cardId, {}) });
        return { ok: true };
      }
      if (typeof body.userId !== 'string' || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 300) throw new HttpError(400, '请选择用户并填写原因（最多 300 字）');
      const users = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${body.userId} FOR UPDATE`;
      if (!users.length) throw new HttpError(404, '用户不存在');
      if (body.action === 'ban') {
        if (typeof body.banned !== 'boolean' || body.userId === admin.id) throw new HttpError(400, '不能禁用自己的账号');
        await tx.user.update({ where: { id: body.userId }, data: { banned: body.banned } });
        if (body.banned) await tx.session.deleteMany({ where: { userId: body.userId } });
        await tx.audit.create({ data: audit('SET_BAN', body.userId, { banned: body.banned, reason: body.reason }) });
        return { ok: true };
      }
      if (body.action !== 'adjust' || !Number.isInteger(body.days) || body.days === 0 || Math.abs(body.days) > 36500) throw new HttpError(400, '调整天数必须为非零整数且不超过 36500');
      const record = await tx.audit.create({ data: audit('ADJUST_MEMBERSHIP', body.userId, { days: body.days, reason: body.reason }) });
      const membership = await adjustMembership(tx, body.userId, body.days, `管理员调整：${body.reason}`, `audit:${record.id}`);
      return { ok: true, membership };
    }));
  });
}
