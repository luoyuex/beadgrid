import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import nodemailer from 'nodemailer';
import { db } from './db';

async function sendMail(to: string, subject: string, url: string) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new Error('邮件服务未配置');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === '465',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text: `${subject}\n请打开以下链接：\n${url}\n如果不是你本人操作，请忽略。` });
}

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => sendMail(user.email, '豆格 BeadGrid · 重置账号密码', url),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => sendMail(user.email, '豆格 BeadGrid · 验证账号邮箱', url),
  },
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 20 },
  session: { cookieCache: { enabled: false } },
  plugins: [nextCookies()],
});
