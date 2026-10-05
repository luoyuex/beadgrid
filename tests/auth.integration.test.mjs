import test from 'node:test';
import assert from 'node:assert/strict';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { emailOTP, username } from 'better-auth/plugins';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { registrationProof, authorizeRegistration } from '../src/lib/registration.mjs';
test('real Better Auth endpoints enforce pre-verification and support username, OTP and password reset', async () => {
  const secret = 'test-auth-secret-'.repeat(3), email = 'auth@example.com';
  const database = { user: [], session: [], account: [], verification: [] }; const delivered = [];
  const auth = betterAuth({
    baseURL: 'http://localhost:3001', secret, database: memoryAdapter(database),
    emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 8, revokeSessionsOnPasswordReset: true },
    emailVerification: { sendOnSignUp: false, sendOnSignIn: false }, rateLimit: { enabled: false },
    hooks: { before: createAuthMiddleware(async context => {
      if (context.path !== '/sign-up/email') return;
      try { authorizeRegistration({ email: context.body?.email }, context, secret); }
      catch (error) { throw new APIError('FORBIDDEN', { message: error.message }); }
    }) },
    databaseHooks: { user: { create: { before: async (user, context) => {
      try { return { data: authorizeRegistration(user, context, secret) }; }
      catch (error) { throw new APIError('FORBIDDEN', { message: error.message }); }
    } } } },
    plugins: [username({ minUsernameLength: 4, maxUsernameLength: 32, usernameValidator: value => /^[a-z0-9_]{4,32}$/i.test(value), immutableUsername: true }), emailOTP({ disableSignUp: true, storeOTP: 'hashed', expiresIn: 300, allowedAttempts: 5, sendVerificationOTP: async data => { delivered.push(data); } })],
  });
  async function post(path, body, cookie) {
    const response = await auth.handler(new Request(`http://localhost:3001/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3001', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  const body = { email, name: 'auth_user', username: 'auth_user', password: 'password8' };
  const denied = await post('/sign-up/email', { ...body, emailVerified: true }); assert.equal(denied.status, 403); assert.equal(database.user.length, 0);
  const proof = `beadgrid-registration=${registrationProof(email, secret)}`;
  const signup = await post('/sign-up/email', body, proof); assert.equal(signup.status, 200, JSON.stringify(signup.body));
  assert.equal(signup.body.user.emailVerified, true); assert.equal(signup.body.user.username, 'auth_user'); assert.equal(delivered.length, 0);
  const login = await post('/sign-in/username', { username: 'AUTH_USER', password: 'password8' }); assert.equal(login.status, 200, JSON.stringify(login.body)); assert.ok(login.cookie);
  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' }); const signInCode = delivered.at(-1).otp;
  const otpLogin = await post('/sign-in/email-otp', { email, otp: signInCode }); assert.equal(otpLogin.status, 200, JSON.stringify(otpLogin.body));
  assert.equal((await post('/sign-in/email-otp', { email, otp: signInCode })).status, 400);
  await post('/email-otp/send-verification-otp', { email, type: 'forget-password' }); const resetCode = delivered.at(-1).otp;
  const check = await post('/email-otp/check-verification-otp', { email, otp: resetCode, type: 'forget-password' }); assert.equal(check.status, 200);
  const reset = await post('/email-otp/reset-password', { email, otp: resetCode, password: 'newpassword8' }); assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal(database.session.length, 0, 'password reset revokes all sessions');
  assert.equal((await post('/sign-in/email', { email, password: 'password8' })).status, 401);
  assert.equal((await post('/sign-in/email', { email, password: 'newpassword8' })).status, 200);
  const before = database.user.length;
  await post('/email-otp/send-verification-otp', { email: 'unknown@example.com', type: 'sign-in' });
  assert.equal(database.user.length, before); assert.equal(delivered.at(-1).email, email, 'unknown accounts do not receive sign-in OTP');
});
