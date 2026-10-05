import { createHash, createHmac, randomBytes } from 'node:crypto';

export class DomainError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function normalizeCard(value) {
  if (typeof value !== 'string') throw new DomainError(400, '请输入有效卡密');
  const code = value.trim().replace(/[-\s]/g, '').toUpperCase();
  if (!/^[A-F0-9]{40}$/.test(code)) throw new DomainError(400, '卡密格式无效');
  return code;
}
export function digestCard(value, secret) {
  if (!secret || secret.length < 32) throw new Error('CARD_HASH_SECRET must contain at least 32 characters');
  return createHmac('sha256', secret).update(normalizeCard(value)).digest('hex');
}
export function newCard() { return randomBytes(20).toString('hex').toUpperCase().match(/.{1,5}/g).join('-'); }
export function exportHash(payload) {
  return createHash('sha256').update(JSON.stringify({ renderer: 1, ...payload })).digest('hex');
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
export async function redeem(db, userId, digest, now = new Date()) {
  return serial(db, async tx => {
    await lockUser(tx, userId);
    const card = await tx.card.findUnique({ where: { digest }, include: { batch: true } });
    if (!card || card.status !== 'UNUSED' || (card.batch.expiresAt && card.batch.expiresAt <= now)) throw new DomainError(400, '卡密无效、已使用、已禁用或已过期');
    const changed = await tx.card.updateMany({ where: { id: card.id, status: 'UNUSED' }, data: { status: 'REDEEMED', redeemedAt: now } });
    if (changed.count !== 1) throw new DomainError(409, '卡密已使用');
    await tx.redemption.create({ data: { cardId: card.id, userId, credits: card.batch.credits } });
    const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId, balance: card.batch.credits }, update: { balance: { increment: card.batch.credits } } });
    await tx.ledger.create({ data: { userId, delta: card.batch.credits, reason: '卡密兑换', reference: `card:${card.id}` } });
    return { credits: card.batch.credits, balance: wallet.balance, reserved: wallet.reserved };
  });
}
export async function reserveExport(db, userId, hash, now = new Date()) {
  return serial(db, async tx => {
    await lockUser(tx, userId);
    let job = await tx.exportJob.findUnique({ where: { userId_hash: { userId, hash } } });
    if (job?.status === 'SUCCEEDED') return { job, cached: true };
    if (job?.status === 'PROCESSING') throw new DomainError(409, '图纸正在生成，请稍后在个人中心查看；超时任务等待恢复后可重试');
    await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (wallet.balance - wallet.reserved < 1) throw new DomainError(402, '次数不足，请先兑换卡密');
    await tx.wallet.update({ where: { userId }, data: { reserved: { increment: 1 } } });
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
    await tx.wallet.update({ where: { userId: job.userId }, data: { balance: { decrement: 1 }, reserved: { decrement: 1 } } });
    await tx.ledger.create({ data: { userId: job.userId, delta: -1, reason: '成品导出', reference: `export:${job.id}` } });
  });
}
export async function releaseExport(db, job, expiredOnly = false) {
  return serial(db, async tx => {
    // Recovery also works for banned users. The attempt fences late workers.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${job.userId} FOR UPDATE`;
    const changed = await tx.exportJob.updateMany({ where: { id: job.id, status: 'PROCESSING', attempt: job.attempt, ...(expiredOnly ? { leaseUntil: { lte: new Date() } } : {}) }, data: { status: 'FAILED' } });
    if (changed.count) await tx.wallet.update({ where: { userId: job.userId }, data: { reserved: { decrement: 1 } } });
    return changed.count;
  });
}
