// Transactional double for state-transition tests. PostgreSQL locking is tested separately.
export function memoryDb(balance = 1) {
  const db = { state: { users: [{ id: 'u1', banned: false }, { id: 'u2', banned: false }], wallets: [{ userId: 'u1', balance, reserved: 0 }], cards: [], jobs: [], ledger: [], redemptions: [] } };
  let queue = Promise.resolve(); let seq = 0;
  const match = (row, where) => Object.entries(where).every(([key, value]) => typeof value === 'object' && value !== null ? ('gt' in value ? row[key] > value.gt : 'lte' in value ? row[key] <= value.lte : false) : row[key] === value);
  const update = (row, data) => { for (const [key, value] of Object.entries(data)) if (value !== undefined) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value && typeof value === 'object' && 'decrement' in value ? row[key] - value.decrement : value; return structuredClone(row); };
  function tx() {
    return {
      $queryRaw: async (_strings, userId) => structuredClone(db.state.users.filter(user => user.id === userId)),
      wallet: {
        findUnique: async ({ where }) => structuredClone(db.state.wallets.find(w => match(w, where))),
        upsert: async ({ where, create, update: data }) => { let row = db.state.wallets.find(w => match(w, where)); if (!row) { row = { balance: 0, reserved: 0, ...create }; db.state.wallets.push(row); } else update(row, data); return structuredClone(row); },
        update: async ({ where, data }) => update(db.state.wallets.find(w => match(w, where)), data),
      },
      card: {
        findUnique: async ({ where }) => structuredClone(db.state.cards.find(c => match(c, where))),
        updateMany: async ({ where, data }) => { const rows = db.state.cards.filter(c => match(c, where)); rows.forEach(row => update(row, data)); return { count: rows.length }; },
      },
      redemption: { create: async ({ data }) => { db.state.redemptions.push(structuredClone(data)); return data; } },
      ledger: { create: async ({ data }) => { if (db.state.ledger.some(l => l.reference === data.reference)) throw Object.assign(new Error('Unique'), { code: 'P2002' }); db.state.ledger.push(structuredClone(data)); return data; } },
      exportJob: {
        findUnique: async ({ where }) => structuredClone(db.state.jobs.find(j => match(j, where.userId_hash))),
        create: async ({ data }) => { const row = { id: 'job' + ++seq, status: 'PROCESSING', ...data }; db.state.jobs.push(row); return structuredClone(row); },
        update: async ({ where, data }) => update(db.state.jobs.find(j => match(j, where)), data),
        updateMany: async ({ where, data }) => { const rows = db.state.jobs.filter(j => match(j, where)); rows.forEach(row => update(row, data)); return { count: rows.length }; },
      },
    };
  }
  db.$transaction = work => {
    const result = queue.then(async () => { const backup = structuredClone(db.state); try { return await work(tx()); } catch (error) { db.state = backup; throw error; } });
    queue = result.catch(() => {}); return result;
  };
  return db;
}
