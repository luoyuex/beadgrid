import { createHash, createHmac, randomBytes } from 'node:crypto';
import { DAY_MS, membershipStatus } from './status.mjs';

export class DomainError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function normalizeCard(value) {
  if (typeof value !== 'string') throw new DomainError(400, '请输入有效兑换码');
  const code = value.trim().replace(/[-\s]/g, '').toUpperCase();
  if (!/^[A-F0-9]{40}$/.test(code)) throw new DomainError(400, '兑换码格式无效');
  return code;
}
export function digestCard(value, secret) {
  if (!secret || secret.length < 32) throw new Error('CARD_HASH_SECRET must contain at least 32 characters');
  return createHmac('sha256', secret).update(normalizeCard(value)).digest('hex');
}
export function newCard() { return randomBytes(20).toString('hex').toUpperCase().match(/.{1,5}/g).join('-'); }
export function exportHash(payload) {
  return createHash('sha256').update(JSON.stringify({ renderer: 2, ...payload })).digest('hex');
}
export function validateExport(input, mapping) {
  const invalid = () => { throw new DomainError(400, '图纸或导出设置无效（最多 200 × 200 格）'); };
  if (!input || typeof input !== 'object') invalid();
  const { gridDimensions: dims, mappedPixelData: data, selectedColorSystem: system, options: raw } = input;
  if (!dims || !Number.isInteger(dims.N) || !Number.isInteger(dims.M) || dims.N < 1 || dims.M < 1 || dims.N > 200 || dims.M > 200) invalid();
  if (!['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'].includes(system)) invalid();
  if (!Array.isArray(data) || data.length !== dims.M || !raw || typeof raw !== 'object') invalid();
  const options = {};
  for (const key of ['showGrid', 'showCoordinates', 'showCellNumbers', 'includeStats', 'exportCsv']) {
    if (typeof raw[key] !== 'boolean') invalid();
    options[key] = raw[key];
  }
  if (!Number.isInteger(raw.gridInterval) || raw.gridInterval < 1 || raw.gridInterval > 100 || !/^#[a-fA-F0-9]{6}$/.test(raw.gridLineColor)) invalid();
  options.gridInterval = raw.gridInterval;
  options.gridLineColor = raw.gridLineColor.toUpperCase();
  const grid = data.map(row => {
    if (!Array.isArray(row) || row.length !== dims.N) invalid();
    return row.map(cell => {
      if (!cell || typeof cell !== 'object' || (cell.isExternal !== undefined && typeof cell.isExternal !== 'boolean')) invalid();
      if (cell.isExternal || cell.key === 'ERASE' || cell.color === 'transparent') return null;
      if (typeof cell.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(cell.color)) invalid();
      const hex = cell.color.toUpperCase();
      if (!mapping[hex]?.[system]) invalid();
      return hex;
    });
  });
  // Never trust client supplied keys, statistics, total counts or palette.
  return { width: dims.N, height: dims.M, system, grid, options };
}

export async function serial(db, work) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15_000 }); }
    catch (error) {
      if (!['P2034', 'P2002'].includes(error.code) || attempt === 3) throw error;
    }
  }
}
async function lockUser(tx, userId) {
  const users = await tx.$queryRaw`SELECT "id", "banned" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  if (!users[0] || users[0].banned) throw new DomainError(403, '账号已禁用');
}
export function changeExpiry(previous, days, now = new Date()) {
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 36500) throw new DomainError(400, '会员天数必须为非零整数，最多 36500 天');
  const base = previous ? new Date(previous) : now;
  const expiry = new Date((days > 0 ? Math.max(base.getTime(), now.getTime()) : base.getTime()) + days * DAY_MS);
  if (!Number.isFinite(expiry.getTime())) throw new DomainError(400, '会员到期时间无效');
  return expiry;
}
export async function requireMembership(db, userId, now = new Date()) {
  const membership = await db.membership.findUnique({ where: { userId } });
  if (!membershipStatus(membership?.expiresAt, now).active) throw new DomainError(403, '会员未开通或已到期，请先兑换兑换码');
  return membership;
}
export async function redeem(db, userId, digest, now = new Date()) {
  return serial(db, async tx => {
    await lockUser(tx, userId);
    const card = await tx.card.findUnique({ where: { digest }, include: { batch: true } });
    if (!card || card.status !== 'UNUSED' || (card.batch.expiresAt && card.batch.expiresAt <= now)) throw new DomainError(400, '兑换码无效、已使用、已禁用或已过期');
    const changed = await tx.card.updateMany({ where: { id: card.id, status: 'UNUSED' }, data: { status: 'REDEEMED', redeemedAt: now } });
    if (changed.count !== 1) throw new DomainError(409, '兑换码已使用');
    if (!Number.isInteger(card.batch.durationDays) || card.batch.durationDays < 1) throw new DomainError(400, '兑换码会员天数无效');
    const previous = await tx.membership.findUnique({ where: { userId } });
    const previousExpiresAt = previous?.expiresAt ?? null;
    const expiresAt = changeExpiry(previousExpiresAt, card.batch.durationDays, now);
    await tx.redemption.create({ data: { cardId: card.id, userId, durationDays: card.batch.durationDays, previousExpiresAt, expiresAt } });
    await tx.membership.upsert({ where: { userId }, create: { userId, expiresAt }, update: { expiresAt } });
    await tx.membershipEvent.create({ data: { userId, days: card.batch.durationDays, previousExpiresAt, expiresAt, reason: '兑换码兑换', reference: `card:${card.id}` } });
    return { durationDays: card.batch.durationDays, ...membershipStatus(expiresAt, now) };
  });
}
export async function adjustMembership(tx, userId, days, reason, reference, now = new Date()) {
  const previous = await tx.membership.findUnique({ where: { userId } });
  if (days < 0 && !previous) throw new DomainError(400, '该用户尚未开通会员');
  const previousExpiresAt = previous?.expiresAt ?? null;
  const expiresAt = changeExpiry(previousExpiresAt, days, now);
  await tx.membership.upsert({ where: { userId }, create: { userId, expiresAt }, update: { expiresAt } });
  await tx.membershipEvent.create({ data: { userId, days, previousExpiresAt, expiresAt, reason, reference } });
  return membershipStatus(expiresAt, now);
}
export async function startExport(db, userId, hash, now = new Date()) {
  return serial(db, async tx => {
    await lockUser(tx, userId);
    await requireMembership(tx, userId, now);
    let job = await tx.exportJob.findUnique({ where: { userId_hash: { userId, hash } } });
    if (job?.status === 'SUCCEEDED') return { job, cached: true };
    if (job?.status === 'PROCESSING') throw new DomainError(409, '图纸正在生成，请稍后在个人中心查看；超时任务等待恢复后可重试');
    const attempt = randomBytes(16).toString('hex');
    const leaseUntil = new Date(now.getTime() + 10 * 60_000);
    job = job
      ? await tx.exportJob.update({ where: { id: job.id }, data: { status: 'PROCESSING', attempt, leaseUntil, files: undefined } })
      : await tx.exportJob.create({ data: { userId, hash, attempt, leaseUntil } });
    return { job, cached: false };
  });
}
export async function finishExport(db, job, files, now = new Date()) {
  return serial(db, async tx => {
    await lockUser(tx, job.userId);
    const changed = await tx.exportJob.updateMany({ where: { id: job.id, status: 'PROCESSING', attempt: job.attempt, leaseUntil: { gt: now } }, data: { status: 'SUCCEEDED', files } });
    if (changed.count !== 1) throw new DomainError(409, '导出已超时，请重试');
  });
}
export async function releaseExport(db, job, expiredOnly = false) {
  return serial(db, async tx => {
    // Recovery also works for banned users. The attempt fences late workers.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${job.userId} FOR UPDATE`;
    const changed = await tx.exportJob.updateMany({ where: { id: job.id, status: 'PROCESSING', attempt: job.attempt, ...(expiredOnly ? { leaseUntil: { lte: new Date() } } : {}) }, data: { status: 'FAILED' } });
    return changed.count;
  });
}
