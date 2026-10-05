import { PrismaClient } from '@prisma/client';
import { releaseExport } from '../src/lib/membership/core.mjs';
const db = new PrismaClient();
try {
  const jobs = await db.exportJob.findMany({ where: { status: 'PROCESSING', leaseUntil: { lte: new Date() } }, take: 100 });
  let recovered = 0;
  for (const job of jobs) recovered += await releaseExport(db, job, true);
  if (recovered) await db.audit.create({ data: { actorId: 'operator-cli', action: 'RECOVER_EXPORTS', targetId: 'exports', detail: { recovered } } });
  console.log(`Recovered ${recovered} expired exports`);
  await db.requestLimit.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 86400000) } } });
} finally { await db.$disconnect(); }
