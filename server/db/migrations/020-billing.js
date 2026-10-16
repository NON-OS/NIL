// Nil Pro is billed with invoices: a USD price, exact token amounts that end in a per-invoice
// suffix, and the transfers to the treasury that pay them, each counted once its block is
// final. Billing lives in its own tables because it belongs to the server, not the workspace:
// erasing the workspace or restoring a capsule leaves it alone.
//
// Bounty payments get the same footing: a payment starts as an intent with an exact amount
// and a starting block, and a transfer counts once its block is final.
const billing = `
  CREATE TABLE billing_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE billing_invoices (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    kind TEXT NOT NULL DEFAULT 'periods',
    periods INTEGER NOT NULL,
    people INTEGER NOT NULL,
    seats INTEGER NOT NULL,
    -- micro-USD
    base_usd INTEGER NOT NULL,
    seats_usd INTEGER NOT NULL,
    staker_percent INTEGER NOT NULL DEFAULT 0,
    staker_usd INTEGER NOT NULL DEFAULT 0,
    total_usd INTEGER NOT NULL,
    credit_usd INTEGER NOT NULL DEFAULT 0,
    due_usd INTEGER NOT NULL,
    nox_percent INTEGER NOT NULL DEFAULT 0,
    zsp INTEGER NOT NULL DEFAULT 0,
    suffix INTEGER NOT NULL,
    start_block INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    retry_of TEXT REFERENCES billing_invoices(id),
    -- no foreign key: the invoice outlives an erased workspace, and then loses this link
    created_by TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    paid_at INTEGER,
    closed_at INTEGER,
    granted_ms INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX billing_invoices_status ON billing_invoices(status, expires_at);

  CREATE TABLE billing_amounts (
    invoice_id TEXT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    symbol TEXT NOT NULL,
    decimals INTEGER NOT NULL,
    amount TEXT NOT NULL,
    -- the step the price part of the amount moves in; everything below it is the suffix
    grid TEXT NOT NULL,
    -- USD per whole token, scaled by 10^18, locked when the invoice was made
    rate TEXT NOT NULL,
    rate_source TEXT NOT NULL,
    PRIMARY KEY (invoice_id, token)
  );

  -- A transfer to the treasury, or a transaction someone told us about before it was mined
  -- (log_index -1). A token of NULL means NOX, for payments made before invoices.
  CREATE TABLE billing_payments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT REFERENCES billing_invoices(id),
    tx_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL DEFAULT -1,
    token TEXT,
    from_address TEXT,
    amount TEXT,
    usd INTEGER,
    on_time INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL,
    problem TEXT,
    block_number INTEGER,
    block_hash TEXT,
    created_at INTEGER NOT NULL,
    checked_at INTEGER,
    final_at INTEGER,
    UNIQUE (tx_hash, log_index)
  );
  CREATE INDEX billing_payments_tx ON billing_payments(tx_hash);
  CREATE INDEX billing_payments_invoice ON billing_payments(invoice_id);
  CREATE INDEX billing_payments_status ON billing_payments(status);

  -- what the subscription had already counted moves over unchanged
  INSERT INTO billing_state (key, value) SELECT 'plan', value FROM settings WHERE key = 'plan';
  DELETE FROM settings WHERE key = 'plan';
  INSERT INTO billing_state (key, value) SELECT 'trialStart', CAST(created_at AS TEXT) FROM workspace WHERE id = 1;
  INSERT INTO billing_payments (id, tx_hash, from_address, amount, status, problem, block_number, created_at, checked_at, final_at)
    SELECT id, tx_hash, from_address, amount,
      CASE status WHEN 'confirmed' THEN 'final' ELSE 'failed' END,
      CASE status WHEN 'confirmed' THEN NULL ELSE 'Recorded before invoices replaced direct payments, and never counted.' END,
      block_number, created_at, checked_at, confirmed_at
    FROM plan_payments;
  DROP TABLE plan_payments;

  -- the holder door keeps checking the members it let in
  ALTER TABLE users ADD COLUMN holder_below_since INTEGER;
  ALTER TABLE users ADD COLUMN holder_checked_at INTEGER;

  CREATE TABLE payment_intents (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    payer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    payee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    to_address TEXT NOT NULL,
    token TEXT NOT NULL,
    amount TEXT NOT NULL,
    suffix INTEGER NOT NULL,
    grid TEXT NOT NULL,
    start_block INTEGER NOT NULL,
    stealth_ephemeral TEXT,
    stealth_view_tag INTEGER,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX payment_intents_task ON payment_intents(task_id);

  ALTER TABLE payments ADD COLUMN intent_id TEXT REFERENCES payment_intents(id) ON DELETE SET NULL;
  ALTER TABLE payments ADD COLUMN expected TEXT;
  ALTER TABLE payments ADD COLUMN grid TEXT;
  ALTER TABLE payments ADD COLUMN start_block INTEGER;
  ALTER TABLE payments ADD COLUMN block_hash TEXT;
  ALTER TABLE payments ADD COLUMN cancelled_at INTEGER;
  ALTER TABLE payments ADD COLUMN announce_block_hash TEXT;
`;

export default billing;
