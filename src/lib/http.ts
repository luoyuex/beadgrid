import { headers } from 'next/headers';
import { getSessionCookie } from 'better-auth/cookies';
import { auth } from './auth';
import { db } from './db';
import { DomainError } from './membership/core.mjs';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function requireUser(admin = false) {
  const requestHeaders = await headers();
  if (!getSessionCookie(requestHeaders)) throw new HttpError(401, '请先登录');
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) throw new HttpError(401, '请先登录');
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.banned) throw new HttpError(403, '账号已禁用');
  if (!user.emailVerified) throw new HttpError(403, '请先验证邮箱');
  if (admin && user.role !== 'ADMIN') throw new HttpError(403, '需要管理员权限');
  return user;
}
export function assertOrigin(request: Request) {
  const expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
  if (request.headers.get('origin') !== expected) throw new HttpError(403, '请求来源无效');
}
export async function readJson(request: Request, maxBytes = 16_384) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, '需要 JSON 请求');
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HttpError(413, '请求过大');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '请求为空');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, '请求过大'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'JSON 格式无效');
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
export async function endpoint(work: () => Promise<Response>) {
  try { return await work(); } catch (error) {
    if (error instanceof HttpError || error instanceof DomainError) return json({ error: error.message }, error.status);
    console.error('Membership request failed', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: '服务暂时不可用，请稍后重试' }, 503);
  }
}
export async function rateLimit(key: string, max = 10) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + 60_000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RequestLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RequestLimit"."resetAt" <= ${now} THEN 1 ELSE "RequestLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RequestLimit"."resetAt" <= ${now} THEN ${resetAt} ELSE "RequestLimit"."resetAt" END
    RETURNING "count"`;
  if (rows[0].count > max) throw new HttpError(429, '操作过于频繁，请一分钟后重试');
}
