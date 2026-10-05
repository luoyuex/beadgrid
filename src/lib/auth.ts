import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP, username } from 'better-auth/plugins';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { sendMail, sendCodeMail } from './mail';
import { authorizeRegistration } from './registration.mjs';
import { db } from './db';

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => sendMail(user.email, '豆格 BeadGrid · 重置账号密码', url),
  },
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => sendMail(user.email, '豆格 BeadGrid · 验证账号邮箱', url),
  },
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 20 },
  session: { cookieCache: { enabled: false } },
  hooks: { before: createAuthMiddleware(async context => {
    if (context.path !== '/sign-up/email') return;
    try { authorizeRegistration({ email: context.body?.email }, context, process.env.BETTER_AUTH_SECRET); }
    catch (error) { throw new APIError('FORBIDDEN', { message: error instanceof Error ? error.message : '请先验证邮箱' }); }
  }) },
  databaseHooks: {
    user: { create: { before: async (user, context) => {
      try { return { data: authorizeRegistration(user, context, process.env.BETTER_AUTH_SECRET) }; }
      catch (error) { throw new APIError('FORBIDDEN', { message: error instanceof Error ? error.message : '请先验证邮箱' }); }
    } } },
  },
  plugins: [
    username({ minUsernameLength: 4, maxUsernameLength: 32, usernameValidator: value => /^[a-z0-9_]{4,32}$/i.test(value), immutableUsername: true }),
    emailOTP({ disableSignUp: true, otpLength: 6, expiresIn: 300, allowedAttempts: 5, storeOTP: 'hashed', sendVerificationOTP: async ({ email, otp, type }) => sendCodeMail(email, otp, type === 'forget-password' ? '重置密码' : '登录') }),
    nextCookies(),
  ],
});
