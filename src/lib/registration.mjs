import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { DomainError, serial } from './membership/core.mjs';
export const REGISTRATION_COOKIE = 'beadgrid-registration';
export function normalizedEmail(value) {
  if (typeof value !== 'string') throw new DomainError(400, '请输入有效邮箱');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError(400, '请输入有效邮箱');
  return email;
}
export function normalizedUsername(value) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z0-9_]{4,32}$/.test(username)) throw new DomainError(400, '用户名需要 4–32 位英文字母、数字或下划线');
  return username;
}
function mac(value, secret) {
  if (!secret || secret.length < 32) throw new Error('认证密钥未配置');
  return createHmac('sha256', secret).update(value).digest('hex');
}
export function registrationProof(email, secret, now = new Date()) {
  const payload = Buffer.from(JSON.stringify({ email: normalizedEmail(email), expires: now.getTime() + 15 * 60_000 })).toString('base64url');
  return `${payload}.${mac(`registration-proof:${payload}`, secret)}`;
}
export function verifyRegistrationProof(token, email, secret, now = new Date()) {
  try {
    if (typeof token !== 'string') return false;
    const [payload, signature, extra] = token.split('.');
    if (extra || !/^[a-f0-9]{64}$/.test(signature)) return false;
    const expected = mac(`registration-proof:${payload}`, secret);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.email === normalizedEmail(email) && Number.isFinite(data.expires) && data.expires > now.getTime();
  } catch { return false; }
}
export function registrationCookie(headers) {
  return headers?.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${REGISTRATION_COOKIE}=`))?.slice(REGISTRATION_COOKIE.length + 1);
}
export function authorizeRegistration(user, context, secret) {
  if (context?.path !== '/sign-up/email' || !verifyRegistrationProof(registrationCookie(context.headers), user.email, secret)) throw new DomainError(403, '请先完成邮箱验证码验证');
  normalizedUsername(context.body?.username);
  return { ...user, emailVerified: true };
}
export async function sendRegistrationCode(db, email, secret, send, now = new Date()) {
  email = normalizedEmail(email);
  const otp = String(randomInt(0, 1000000)).padStart(6, '0');
  const identifier = `beadgrid-register:${email}`;
  await serial(db, async tx => {
    // Per-email lock also protects first-time rows across processes.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))::text`;
    if (await tx.user.findUnique({ where: { email } })) throw new DomainError(409, '该邮箱已注册，请直接登录');
    const existing = await tx.verification.findFirst({ where: { identifier } });
    if (existing && existing.createdAt.getTime() + 60_000 > now.getTime()) throw new DomainError(429, '请等待 60 秒后重新发送');
    await tx.verification.deleteMany({ where: { identifier } });
    await tx.verification.create({ data: { id: randomUUID(), identifier, value: JSON.stringify({ digest: mac(`registration-code:${email}:${otp}`, secret), attempts: 0 }), expiresAt: new Date(now.getTime() + 5 * 60_000), createdAt: now, updatedAt: now } });
  });
  try { await send(email, otp); } catch (error) {
    await db.verification.deleteMany({ where: { identifier, value: JSON.stringify({ digest: mac(`registration-code:${email}:${otp}`, secret), attempts: 0 }) } });
    throw error;
  }
}
export async function verifyRegistrationCode(db, email, otp, secret, now = new Date()) {
  email = normalizedEmail(email);
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw new DomainError(400, '请输入 6 位邮箱验证码');
  const identifier = `beadgrid-register:${email}`;
  const result = await serial(db, async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))::text`;
    const row = await tx.verification.findFirst({ where: { identifier } });
    if (!row || row.expiresAt <= now) return '验证码已过期，请重新发送';
    const data = JSON.parse(row.value);
    if (data.attempts >= 5) return '尝试过多，请重新发送验证码';
    const expected = mac(`registration-code:${email}:${otp}`, secret);
    if (!timingSafeEqual(Buffer.from(data.digest), Buffer.from(expected))) {
      await tx.verification.update({ where: { id: row.id }, data: { value: JSON.stringify({ ...data, attempts: data.attempts + 1 }) } });
      return '验证码错误';
    }
    await tx.verification.deleteMany({ where: { id: row.id } });
    return null;
  });
  // Invalid attempt must commit before returning an error.
  if (result) throw new DomainError(400, result);
  return registrationProof(email, secret, now);
}
