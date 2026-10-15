// NOX bounties: an amount on a task, the on-chain payments that settle it, and a receipt
// kind so reopening a task never revokes proof that someone was paid.
const noxBounties = `
  ALTER TABLE tasks ADD COLUMN bounty TEXT;
  ALTER TABLE tasks ADD COLUMN bounty_state TEXT;
  ALTER TABLE receipts ADD COLUMN kind TEXT NOT NULL DEFAULT 'work';

  CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    task_ref TEXT NOT NULL,
    payer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    payee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    to_address TEXT NOT NULL,
    from_address TEXT,
    amount TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    problem TEXT,
    block_number INTEGER,
    receipt_id TEXT REFERENCES receipts(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    checked_at INTEGER,
    confirmed_at INTEGER
  );
  CREATE INDEX payments_task ON payments(task_id);
  CREATE INDEX payments_payee ON payments(payee_id);
  CREATE INDEX payments_status ON payments(status);
`;

export default noxBounties;
