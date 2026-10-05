import { db } from '@/lib/db';
import { assertOrigin, endpoint, HttpError, json, rateLimit, readJson } from '@/lib/http';
import { sendCodeMail } from '@/lib/mail';
import { normalizedEmail, normalizedUsername, REGISTRATION_COOKIE, registrationCookie, verifyRegistrationProof, sendRegistrationCode, verifyRegistrationCode } from '@/lib/registration.mjs';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const body = await readJson(request);
    const email = normalizedEmail(body?.email);
    await rateLimit(`registration:${email}`, 15);
    const secret = process.env.BETTER_AUTH_SECRET;
    const secureCookie = new URL(process.env.BETTER_AUTH_URL || request.url).protocol === 'https:' ? '; Secure' : '';
    if (body.action === 'send') {
      await sendRegistrationCode(db, email, secret, (to: string, code: string) => sendCodeMail(to, code, '注册'));
      const response = json({ ok: true });
      response.headers.append('Set-Cookie', `${REGISTRATION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie}`);
      return response;
    }
    if (body.action === 'verify') {
      const proof = await verifyRegistrationCode(db, email, body.code, secret);
      const response = json({ ok: true });
      response.headers.append('Set-Cookie', `${REGISTRATION_COOKIE}=${proof}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900${secureCookie}`);
      return response;
    }
    if (body.action === 'username') {
      if (!verifyRegistrationProof(registrationCookie(request.headers), email, secret)) throw new HttpError(403, '请先验证邮箱');
      const username = normalizedUsername(body.username);
      const existing = await db.user.findUnique({ where: { username } });
      return json({ available: !existing });
    }
    throw new HttpError(400, '请求无效');
  });
}
