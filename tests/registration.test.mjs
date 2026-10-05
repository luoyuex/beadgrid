import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedEmail, normalizedUsername, registrationProof, verifyRegistrationProof, authorizeRegistration, sendRegistrationCode, verifyRegistrationCode } from '../src/lib/registration.mjs';
const secret = 's'.repeat(32), email = 'demo@example.com', now = new Date('2026-10-05T12:00:00Z');
function database() {
  const db = { rows: [], users: [] }; let queue = Promise.resolve();
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  db.user = { findUnique: async ({ where }) => db.users.find(row => matches(row, where)) };
  db.verification = {
    findFirst: async ({ where }) => structuredClone(db.rows.find(row => matches(row, where))),
    create: async ({ data }) => { db.rows.push(structuredClone(data)); return data; },
    deleteMany: async ({ where }) => { db.rows = db.rows.filter(row => !matches(row, where)); },
    update: async ({ where, data }) => Object.assign(db.rows.find(row => matches(row, where)), data),
  };
  db.$queryRaw = async () => [];
  db.$transaction = work => {
    const result = queue.then(async () => { const backup = structuredClone(db.rows); try { return await work(db); } catch (error) { db.rows = backup; throw error; } });
    queue = result.catch(() => {}); return result;
  };
  return db;
}
test('email and username normalize and reject malformed identifiers', () => {
  assert.equal(normalizedEmail(' DEMO@example.com '), email);
  assert.equal(normalizedUsername(' Bead_User '), 'bead_user');
  for (const name of ['abc', 'a'.repeat(33), 'has space', '昵称', 'a@b.com']) assert.throws(() => normalizedUsername(name));
  for (const value of ['', 'invalid', null, 'a b@example.com']) assert.throws(() => normalizedEmail(value));
});
test('registration proof binds email and expiry and rejects forged signatures', () => {
  const token = registrationProof(email, secret, now);
  assert.equal(verifyRegistrationProof(token, email, secret, now), true);
  assert.equal(verifyRegistrationProof(token, 'other@example.com', secret, now), false);
  assert.equal(verifyRegistrationProof(token, email, 'x'.repeat(32), now), false);
  assert.equal(verifyRegistrationProof(token, email, secret, new Date(now.getTime() + 900000)), false);
  assert.equal(verifyRegistrationProof(token + '.extra', email, secret, now), false);
});
test('server signup guard cannot be bypassed by client emailVerified or unrelated proof', () => {
  const liveProof = registrationProof(email, secret);
  const user = { email, emailVerified: false, name: 'demo' };
  const context = { path: '/sign-up/email', headers: new Headers({ cookie: `beadgrid-registration=${liveProof}` }), body: { username: 'demo_user' } };
  assert.equal(authorizeRegistration(user, context, secret).emailVerified, true);
  assert.throws(() => authorizeRegistration({ ...user, emailVerified: true }, { ...context, headers: new Headers() }, secret));
  assert.throws(() => authorizeRegistration({ ...user, email: 'other@example.com' }, context, secret));
  assert.throws(() => authorizeRegistration(user, { ...context, path: '/sign-in/email-otp' }, secret));
  assert.throws(() => authorizeRegistration(user, { ...context, body: { username: 'bad' } }, secret));
});
test('signup OTP is six digits, hashed, expires and can only be consumed once', async () => {
  const db = database(); let sent;
  await sendRegistrationCode(db, email, secret, async (to, code) => { assert.equal(to, email); sent = code; }, now);
  assert.match(sent, /^\d{6}$/); assert.equal(db.rows[0].value.includes(sent), false);
  const token = await verifyRegistrationCode(db, email, sent, secret, now);
  assert.equal(verifyRegistrationProof(token, email, secret, now), true); assert.equal(db.rows.length, 0);
  await assert.rejects(verifyRegistrationCode(db, email, sent, secret, now));
});
test('invalid OTP attempts commit and the sixth attempt is blocked', async () => {
  const db = database(); let sent;
  await sendRegistrationCode(db, email, secret, async (_, code) => { sent = code; }, now);
  const wrong = sent === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await assert.rejects(verifyRegistrationCode(db, email, wrong, secret, now), /验证码错误/);
  assert.equal(JSON.parse(db.rows[0].value).attempts, 5);
  await assert.rejects(verifyRegistrationCode(db, email, sent, secret, now), /尝试过多/);
});
test('OTP resend cooldown, expiry and email isolation are enforced on server', async () => {
  const db = database(); let sent;
  await sendRegistrationCode(db, email, secret, async (_, code) => { sent = code; }, now);
  await assert.rejects(sendRegistrationCode(db, email, secret, async () => {}, now), { status: 429 });
  await assert.rejects(verifyRegistrationCode(db, 'other@example.com', sent, secret, now));
  await assert.rejects(verifyRegistrationCode(db, email, sent, secret, new Date(now.getTime() + 300000)), /过期/);
});
test('simultaneous verification consumes one OTP and creates one valid proof', async () => {
  const db = database(); let sent;
  await sendRegistrationCode(db, email, secret, async (_, code) => { sent = code; }, now);
  const results = await Promise.allSettled([verifyRegistrationCode(db, email, sent, secret, now), verifyRegistrationCode(db, email, sent, secret, now)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});
test('email delivery failure removes the unusable code, registered emails are rejected', async () => {
  const db = database();
  await assert.rejects(sendRegistrationCode(db, email, secret, async () => { throw new Error('SMTP'); }, now));
  assert.equal(db.rows.length, 0); db.users.push({ email });
  await assert.rejects(sendRegistrationCode(db, email, secret, async () => {}, now), { status: 409 });
});
