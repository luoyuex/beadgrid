import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redeem, startExport, finishExport, releaseExport } from '../src/lib/membership/core.mjs';
test('PostgreSQL concurrent code redemption and duration membership exports', { skip: !process.env.PERLER_INTEGRATION_DATABASE_URL }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasourceUrl: process.env.PERLER_INTEGRATION_DATABASE_URL });
  const users = [randomUUID(), randomUUID()], digest = randomUUID(); let batch;
  try {
    for (const id of users) await db.user.create({ data: { id, name: 'Test', email: `${id}@example.invalid`, emailVerified: true } });
    batch = await db.cardBatch.create({ data: { durationDays: 30, count: 1, cards: { create: { digest, suffix: 'test' } } } });
    const redemption = await Promise.allSettled(users.map(id => redeem(db, id, digest))); assert.equal(redemption.filter(r => r.status === 'fulfilled').length, 1);
    const winner = users[redemption.findIndex(r => r.status === 'fulfilled')];
    const before = await db.membership.findUnique({ where: { userId: winner } });
    const started = await Promise.allSettled(['a', 'b'].map(hash => startExport(db, winner, hash))); assert.equal(started.filter(r => r.status === 'fulfilled').length, 2);
    const job = started[0].value.job;
    const completed = await Promise.allSettled([finishExport(db, job, [{ key: 'test' }]), finishExport(db, job, [{ key: 'test' }])]); assert.equal(completed.filter(r => r.status === 'fulfilled').length, 1);
    const membership = await db.membership.findUnique({ where: { userId: winner } }); assert.deepEqual(membership.expiresAt, before.expiresAt);
    assert.equal((await startExport(db, winner, job.hash)).cached, true); await releaseExport(db, job);
    assert.equal(await db.membershipEvent.count({ where: { userId: winner } }), 1);
    await db.membership.update({ where: { userId: winner }, data: { expiresAt: new Date(0) } });
    await assert.rejects(startExport(db, winner, job.hash), { status: 403 });
  } finally {
    await db.membershipEvent.deleteMany({ where: { userId: { in: users } } }); await db.exportJob.deleteMany({ where: { userId: { in: users } } }); await db.redemption.deleteMany({ where: { userId: { in: users } } });
    if (batch) { await db.card.deleteMany({ where: { batchId: batch.id } }); await db.cardBatch.delete({ where: { id: batch.id } }); }
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  }
});
