import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const email = process.argv[2]?.trim().toLowerCase();
try {
  if (!email) throw new Error('Usage: npm run admin:grant -- user@example.com');
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.emailVerified || user.banned) throw new Error('Account must exist, be verified and not banned');
  await db.$transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    await tx.audit.create({ data: { actorId: 'operator-cli', action: 'GRANT_ADMIN', targetId: user.id, detail: { email } } });
  });
  console.log('Administrator granted');
} finally { await db.$disconnect(); }
