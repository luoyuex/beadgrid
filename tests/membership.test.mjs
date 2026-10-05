import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digestCard, newCard, normalizeCard, validateExport, exportHash, redeem, startExport, finishExport, releaseExport, serial, adjustMembership, changeExpiry, requireMembership } from '../src/lib/membership/core.mjs';
import { DAY_MS, membershipStatus, downloadLifetime } from '../src/lib/membership/status.mjs';
import { memoryDb } from './helpers/memory-db.mjs';
const mapping = JSON.parse(await readFile(new URL('../src/app/colorSystemMapping.json', import.meta.url)));
const hex = Object.keys(mapping)[0];
const request = () => ({ gridDimensions: { N: 1, M: 1 }, mappedPixelData: [[{ key: 'FAKE', color: hex.toLowerCase() }]], selectedColorSystem: 'MARD', options: { showGrid: true, showCoordinates: true, showCellNumbers: true, includeStats: true, exportCsv: false, gridInterval: 10, gridLineColor: '#555555' } });
test('card entropy, normalization and keyed digest', () => {
  const card = newCard(), secret = 'x'.repeat(32); assert.equal(normalizeCard(card).length, 40);
  assert.equal(digestCard(card, secret), digestCard(card.toLowerCase().replaceAll('-', ' '), secret));
  assert.notEqual(digestCard(card, secret), digestCard(card, 'y'.repeat(32)));
  assert.throws(() => digestCard(card, 'short')); assert.throws(() => normalizeCard('invalid'));
  assert.equal(new Set(Array.from({ length: 100 }, newCard)).size, 100);
});
test('canonical export ignores spoofed keys/counts and property order', () => {
  const a = request(), b = request(); b.mappedPixelData[0][0].key = 'OTHER'; b.colorCounts = { FAKE: 999 }; b.options = Object.fromEntries(Object.entries(b.options).reverse());
  assert.equal(exportHash(validateExport(a, mapping)), exportHash(validateExport(b, mapping)));
  b.options.exportCsv = true; assert.notEqual(exportHash(validateExport(a, mapping)), exportHash(validateExport(b, mapping)));
  b.options.exportCsv = false; b.selectedColorSystem = 'COCO'; assert.notEqual(exportHash(validateExport(a, mapping)), exportHash(validateExport(b, mapping)));
});
test('grid bounds, shape, palettes and options reject malformed input', () => {
  for (const mutate of [r => r.gridDimensions.N = 201, r => r.gridDimensions.M = -1, r => r.mappedPixelData = [], r => r.mappedPixelData[0] = [], r => r.options.showGrid = 'true', r => r.options.gridInterval = 0, r => r.options.gridLineColor = '<script>', r => r.selectedColorSystem = 'UNKNOWN', r => r.mappedPixelData[0][0].color = '#123456']) { const r = request(); mutate(r); assert.throws(() => validateExport(r, mapping)); }
});
test('transparent cells normalize consistently', () => {
  const a = request(), b = request(); a.mappedPixelData[0][0].isExternal = true; b.mappedPixelData[0][0].key = 'ERASE';
  assert.deepEqual(validateExport(a, mapping).grid, [[null]]); assert.equal(exportHash(validateExport(a, mapping)), exportHash(validateExport(b, mapping)));
});
const now = new Date('2026-10-05T12:30:00Z');
const at = days => new Date(now.getTime() + days * DAY_MS);
function addCard(db, id = 'c1', days = 30, deadline = null) {
  db.state.cards.push({ id, digest: id, status: 'UNUSED', batch: { durationDays: days, expiresAt: deadline } });
}
test('status expires at the exact boundary and rounds remaining days for display', () => {
  assert.deepEqual(membershipStatus(null, now), { expiresAt: null, active: false, remainingDays: 0 });
  assert.equal(membershipStatus(now, now).active, false);
  assert.equal(membershipStatus(at(-1), now).remainingDays, 0);
  assert.equal(membershipStatus(new Date(now.getTime() + 1), now).remainingDays, 1);
  assert.equal(membershipStatus(at(30), now).remainingDays, 30);
  assert.equal(membershipStatus('invalid', now).active, false);
});
test('new membership uses the server-side code duration', async () => {
  const db = memoryDb(null); addCard(db, 'c1', 7);
  const result = await redeem(db, 'u1', 'c1', now);
  assert.equal(result.durationDays, 7); assert.equal(result.expiresAt, at(7).toISOString());
  assert.equal(result.active, true); assert.equal(db.state.events.length, 1);
  assert.equal(db.state.redemptions[0].previousExpiresAt, null);
});
test('download signatures never last beyond membership expiry', () => {
  assert.equal(downloadLifetime(at(1), now), 300);
  assert.equal(downloadLifetime(new Date(now.getTime() + 10500), now), 10);
  assert.equal(downloadLifetime(now, now), 0);
  assert.equal(downloadLifetime(at(-1), now), 0);
  assert.equal(downloadLifetime('invalid', now), 0);
});
test('renewal stacks on current expiry, expired membership starts from redemption time', async () => {
  for (const previous of [at(10), at(-10), now]) {
    const db = memoryDb(previous); addCard(db);
    const result = await redeem(db, 'u1', 'c1', now);
    assert.equal(result.expiresAt, at(previous > now ? 40 : 30).toISOString());
    assert.deepEqual(db.state.redemptions[0].previousExpiresAt, previous);
  }
});
test('same code racing across users activates only one membership', async () => {
  const db = memoryDb(null); addCard(db);
  const results = await Promise.allSettled([redeem(db, 'u1', 'c1', now), redeem(db, 'u2', 'c1', now)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(db.state.redemptions.length, 1); assert.equal(db.state.events.length, 1); assert.equal(db.state.memberships.length, 1);
});
test('different codes redeemed concurrently stack without losing days', async () => {
  const db = memoryDb(at(5)); addCard(db, 'a', 7); addCard(db, 'b', 30);
  await Promise.all([redeem(db, 'u1', 'a', now), redeem(db, 'u1', 'b', now)]);
  assert.deepEqual(db.state.memberships[0].expiresAt, at(42)); assert.equal(db.state.events.length, 2);
});
test('invalid, disabled, used, deadline-expired codes and banned users cannot redeem', async () => {
  for (const card of [undefined, { status: 'DISABLED' }, { status: 'REDEEMED' }, { status: 'UNUSED', expiresAt: now }, { status: 'UNUSED', expiresAt: at(-1) }, { status: 'UNUSED', durationDays: 0 }]) {
    const db = memoryDb(null);
    if (card) db.state.cards.push({ id: 'c1', digest: 'c1', status: card.status, batch: { durationDays: card.durationDays ?? 30, expiresAt: card.expiresAt } });
    await assert.rejects(redeem(db, 'u1', 'c1', now)); assert.equal(db.state.memberships.length, 0); assert.equal(db.state.events.length, 0);
  }
  const db = memoryDb(at(5)); db.state.users[0].banned = true; addCard(db);
  await assert.rejects(redeem(db, 'u1', 'c1', now), { status: 403 });
  await assert.rejects(startExport(db, 'u1', 'h', now), { status: 403 });
});
test('missing and expired membership cannot generate or reuse cached exports', async () => {
  for (const expiresAt of [null, at(-1), now]) {
    const db = memoryDb(expiresAt); db.state.jobs.push({ id: 'old', userId: 'u1', hash: 'h', status: 'SUCCEEDED', files: [] });
    await assert.rejects(startExport(db, 'u1', 'new', now), { status: 403 });
    await assert.rejects(startExport(db, 'u1', 'h', now), { status: 403 });
    await assert.rejects(requireMembership(db, 'u1', now), { status: 403 });
  }
});
test('active membership supports concurrent distinct exports without consuming time or units', async () => {
  const db = memoryDb(at(1));
  const results = await Promise.all(['a', 'b', 'c'].map(hash => startExport(db, 'u1', hash, now)));
  for (const result of results) await finishExport(db, result.job, [], now);
  assert.deepEqual(db.state.memberships[0].expiresAt, at(1)); assert.equal(db.state.events.length, 0);
  assert.equal(db.state.jobs.filter(job => job.status === 'SUCCEEDED').length, 3);
});
test('duplicate export is busy during processing and reuses the completed file', async () => {
  const db = memoryDb(at(1)); const { job } = await startExport(db, 'u1', 'h', now);
  await assert.rejects(startExport(db, 'u1', 'h', now), { status: 409 });
  await finishExport(db, job, [{ key: 'private/file' }], now);
  assert.equal((await startExport(db, 'u1', 'h', now)).cached, true);
  await assert.rejects(finishExport(db, job, [], now)); assert.equal(await releaseExport(db, job), 0);
  assert.deepEqual(db.state.memberships[0].expiresAt, at(1));
});
test('retry fences old workers and recovery never changes membership', async () => {
  const db = memoryDb(); const before = db.state.memberships[0].expiresAt;
  const { job: old } = await startExport(db, 'u1', 'h'); await releaseExport(db, old); await releaseExport(db, old);
  const { job } = await startExport(db, 'u1', 'h'); assert.notEqual(old.attempt, job.attempt);
  await assert.rejects(finishExport(db, old, [])); assert.equal(await releaseExport(db, old), 0);
  assert.equal(await releaseExport(db, job, true), 0);
  db.state.jobs[0].leaseUntil = new Date(0); await assert.rejects(finishExport(db, job, []));
  assert.equal(await releaseExport(db, job, true), 1); assert.deepEqual(db.state.memberships[0].expiresAt, before);
});
test('transaction retries serialization conflicts, not domain errors', async () => {
  let calls = 0; const db = { $transaction: async fn => { calls++; if (calls < 3) throw Object.assign(new Error(), { code: 'P2034' }); return fn(); } };
  assert.equal(await serial(db, () => 42), 42); assert.equal(calls, 3);
  calls = 0; await assert.rejects(serial({ $transaction: async () => { calls++; throw new Error('domain'); } }, () => 0)); assert.equal(calls, 1);
});
test('event failure rolls back code redemption and membership expiry', async () => {
  const db = memoryDb(null); addCard(db);
  const transaction = db.$transaction;
  db.$transaction = (work, options) => transaction(tx => { tx.membershipEvent.create = async () => { throw new Error('database failure'); }; return work(tx); }, options);
  await assert.rejects(redeem(db, 'u1', 'c1', now)); assert.equal(db.state.cards[0].status, 'UNUSED'); assert.equal(db.state.memberships.length, 0); assert.equal(db.state.redemptions.length, 0);
});
test('admin adjustments add or subtract days and log before/after expiry', async () => {
  const db = memoryDb(at(10));
  await serial(db, tx => adjustMembership(tx, 'u1', 7, '增加', 'a1', now));
  assert.deepEqual(db.state.memberships[0].expiresAt, at(17));
  await serial(db, tx => adjustMembership(tx, 'u1', -20, '缩短', 'a2', now));
  assert.deepEqual(db.state.memberships[0].expiresAt, at(-3));
  assert.equal(db.state.events.length, 2); assert.deepEqual(db.state.events[1].previousExpiresAt, at(17));
  await serial(db, tx => adjustMembership(tx, 'u1', 1, '重新开通', 'a3', now));
  assert.deepEqual(db.state.memberships[0].expiresAt, at(1));
  const empty = memoryDb(null); await assert.rejects(serial(empty, tx => adjustMembership(tx, 'u1', -1, '缩短', 'a4', now)));
  for (const days of [0, 1.5, NaN, 36501, -36501]) assert.throws(() => changeExpiry(null, days, now));
});
test('export idempotency belongs to the authenticated account', async () => {
  const db = memoryDb(at(1)); db.state.memberships.push({ userId: 'u2', expiresAt: at(1) });
  const a = await startExport(db, 'u1', 'same', now), b = await startExport(db, 'u2', 'same', now); assert.notEqual(a.job.id, b.job.id);
  await finishExport(db, a.job, [], now); assert.equal(db.state.jobs[1].status, 'PROCESSING');
  assert.deepEqual(db.state.memberships[1].expiresAt, at(1));
});
