import nodemailer from 'nodemailer';
export async function sendMail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new Error('邮件服务未配置');
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_PORT === '465', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
export async function sendCodeMail(to: string, code: string, purpose: string) {
  await sendMail(to, `豆格 BeadGrid · ${purpose}验证码`, `你的验证码是：${code}\n5 分钟内有效。请勿将验证码提供给他人。\n如果不是你本人操作，请忽略。`);
}
