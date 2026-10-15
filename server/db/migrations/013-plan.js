// The NOX subscription: payments to the treasury, checked on-chain like bounty payments.
const plan = `
  CREATE TABLE plan_payments (
    id TEXT PRIMARY KEY,
    payer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    problem TEXT,
    amount TEXT,
    periods INTEGER,
    from_address TEXT,
    block_number INTEGER,
    created_at INTEGER NOT NULL,
    checked_at INTEGER,
    confirmed_at INTEGER
  );
`;

export default plan;
