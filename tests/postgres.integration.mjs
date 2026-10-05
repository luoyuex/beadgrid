import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redeem, reserveExport, finishExport, releaseExport } from '../src/lib/membership/core.mjs';
test('PostgreSQL concurrent redemption and export charging', { skip: !process.env.PERLER_INTEGRATION_DATABASE_URL }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasourceUrl: process.env.PERLER_INTEGRATION_DATABASE_URL });
  const users = [randomUUID(), randomUUID()], digest = randomUUID(); let batch;
  try {
    for (const id of users) await db.user.create({ data: { id, name: 'Test', email: `${id}@example.invalid`, emailVerified: true } });
    batch = await db.cardBatch.create({ data: { credits: 1, count: 1, cards: { create: { digest, suffix: 'test' } } } });
    const redemption = await Promise.allSettled(users.map(id => redeem(db, id, digest))); assert.equal(redemption.filter(r => r.status === 'fulfilled').length, 1);
    const winner = users[redemption.findIndex(r => r.status === 'fulfilled')];
    const reserved = await Promise.allSettled(['a', 'b'].map(hash => reserveExport(db, winner, hash))); assert.equal(reserved.filter(r => r.status === 'fulfilled').length, 1);
    const job = reserved.find(r => r.status === 'fulfilled').value.job;
    const completed = await Promise.allSettled([finishExport(db, job, [{ key: 'test' }]), finishExport(db, job, [{ key: 'test' }])]); assert.equal(completed.filter(r => r.status === 'fulfilled').length, 1);
    const wallet = await db.wallet.findUnique({ where: { userId: winner } }); assert.equal(wallet.balance, 0); assert.equal(wallet.reserved, 0);
    assert.equal((await reserveExport(db, winner, job.hash)).cached, true); await releaseExport(db, job); assert.equal(await db.ledger.count({ where: { userId: winner, delta: -1 } }), 1);
  } finally {
    await db.ledger.deleteMany({ where: { userId: { in: users } } }); await db.exportJob.deleteMany({ where: { userId: { in: users } } }); await db.redemption.deleteMany({ where: { userId: { in: users } } });
    if (batch) { await db.card.deleteMany({ where: { batchId: batch.id } }); await db.cardBatch.delete({ where: { id: batch.id } }); }
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  }
});
