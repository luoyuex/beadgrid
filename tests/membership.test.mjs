import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digestCard, newCard, normalizeCard, validateExport, exportHash, redeem, reserveExport, finishExport, releaseExport, serial } from '../src/lib/membership/core.mjs';
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
test('same card racing across users credits one wallet', async () => {
  const db = memoryDb(0); db.state.cards.push({ id: 'c1', digest: 'd1', status: 'UNUSED', batch: { credits: 10 } });
  const results = await Promise.allSettled([redeem(db, 'u1', 'd1'), redeem(db, 'u2', 'd1')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(db.state.redemptions.length, 1); assert.equal(db.state.ledger.length, 1); assert.equal(db.state.wallets.reduce((n, w) => n + w.balance, 0), 10);
});
test('invalid cards and banned users do not credit', async () => {
  for (const card of [undefined, { status: 'DISABLED' }, { status: 'REDEEMED' }, { status: 'UNUSED', expiresAt: new Date(0) }]) {
    const db = memoryDb(0); if (card) db.state.cards.push({ id: 'c1', digest: 'd1', status: card.status, batch: { credits: 10, expiresAt: card.expiresAt } });
    await assert.rejects(redeem(db, 'u1', 'd1')); assert.equal(db.state.wallets[0].balance, 0); assert.equal(db.state.ledger.length, 0);
  }
  const db = memoryDb(); db.state.users[0].banned = true; await assert.rejects(reserveExport(db, 'u1', 'h'));
});
test('concurrent exports cannot overspend one credit', async () => {
  const db = memoryDb(1); const results = await Promise.allSettled([reserveExport(db, 'u1', 'a'), reserveExport(db, 'u1', 'b')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(db.state.wallets[0].reserved, 1); assert.equal(db.state.wallets[0].balance, 1);
});
test('duplicate export is busy during processing and free after completion', async () => {
  const db = memoryDb(1); const { job } = await reserveExport(db, 'u1', 'h'); await assert.rejects(reserveExport(db, 'u1', 'h'), { status: 409 });
  await finishExport(db, job, [{ key: 'private/file' }]); assert.equal(db.state.wallets[0].balance, 0); assert.equal(db.state.wallets[0].reserved, 0);
  assert.equal((await reserveExport(db, 'u1', 'h')).cached, true); await assert.rejects(finishExport(db, job, [])); assert.equal(db.state.ledger.length, 1);
  await releaseExport(db, job); assert.equal(db.state.wallets[0].reserved, 0);
});
test('failure releases once; retry fences old worker and charges once', async () => {
  const db = memoryDb(1); const { job: old } = await reserveExport(db, 'u1', 'h'); await releaseExport(db, old); await releaseExport(db, old); assert.equal(db.state.wallets[0].reserved, 0);
  const { job } = await reserveExport(db, 'u1', 'h'); assert.notEqual(old.attempt, job.attempt); await assert.rejects(finishExport(db, old, [])); await releaseExport(db, old); assert.equal(db.state.wallets[0].reserved, 1);
  await finishExport(db, job, []); assert.equal(db.state.wallets[0].balance, 0); assert.equal(db.state.ledger.length, 1);
});
test('recovery releases expired reservation, preserves active reservation', async () => {
  const db = memoryDb(1); const { job } = await reserveExport(db, 'u1', 'h'); assert.equal(await releaseExport(db, job, true), 0);
  db.state.jobs[0].leaseUntil = new Date(0); await assert.rejects(finishExport(db, job, [])); assert.equal(await releaseExport(db, job, true), 1); assert.equal(db.state.wallets[0].balance, 1); assert.equal(db.state.wallets[0].reserved, 0);
});
test('transaction retries serialization conflicts, not domain errors', async () => {
  let calls = 0; const db = { $transaction: async fn => { calls++; if (calls < 3) throw Object.assign(new Error(), { code: 'P2034' }); return fn(); } };
  assert.equal(await serial(db, () => 42), 42); assert.equal(calls, 3);
  calls = 0; await assert.rejects(serial({ $transaction: async () => { calls++; throw new Error('domain'); } }, () => 0)); assert.equal(calls, 1);
});
test('ledger failure rolls back both card consumption and balance', async () => {
  const db = memoryDb(0); db.state.cards.push({ id: 'c1', digest: 'd1', status: 'UNUSED', batch: { credits: 10 } });
  const transaction = db.$transaction;
  db.$transaction = (work, options) => transaction(tx => { tx.ledger.create = async () => { throw new Error('database failure'); }; return work(tx); }, options);
  await assert.rejects(redeem(db, 'u1', 'd1')); assert.equal(db.state.cards[0].status, 'UNUSED'); assert.equal(db.state.wallets[0].balance, 0); assert.equal(db.state.redemptions.length, 0);
});
test('completion rollback allows failure release without charging', async () => {
  const db = memoryDb(1); const { job } = await reserveExport(db, 'u1', 'h');
  const transaction = db.$transaction;
  db.$transaction = (work, options) => transaction(tx => { tx.ledger.create = async () => { throw new Error('database failure'); }; return work(tx); }, options);
  await assert.rejects(finishExport(db, job, [])); assert.equal(db.state.jobs[0].status, 'PROCESSING'); assert.equal(db.state.wallets[0].balance, 1);
  await releaseExport(db, job); assert.equal(db.state.wallets[0].reserved, 0); assert.equal(db.state.ledger.length, 0);
});
test('export idempotency belongs to the authenticated account', async () => {
  const db = memoryDb(1); db.state.wallets.push({ userId: 'u2', balance: 1, reserved: 0 });
  const a = await reserveExport(db, 'u1', 'same'), b = await reserveExport(db, 'u2', 'same'); assert.notEqual(a.job.id, b.job.id);
  await finishExport(db, a.job, []); assert.equal(db.state.wallets[1].balance, 1); assert.equal(db.state.wallets[1].reserved, 1);
});
