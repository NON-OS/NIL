import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';

// Differential tests for formal/Nil/Invoice: Nil's billing functions against the Lean model's
// vectors. coverage and settleInvoice read the database, so their cases are written as rows.
const vectors = JSON.parse(fs.readFileSync(new URL('../../formal/vectors/invoice.json', import.meta.url)));
const TOKENS = ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'];

let srv;
let sql;
let fns;
before(async () => {
  srv = await startServer({ env: { PLAN_PERIOD_DAYS: '30', PLAN_AMOUNT_DECIMALS: '8' } });
  ({ default: sql } = await import('../db/sql.js'));
  const names = ['askAmount', 'sameSuffix', 'amountGrid', 'pickSuffix', 'usdToUnits', 'unitsToUsd', 'coverage', 'settleInvoice', 'permute'];
  fns = Object.fromEntries(await Promise.all(names.map(async (n) => [n, (await import(`../billing/${n}.js`)).default])));
});
after(() => srv.close());

let made = 0;
// an invoice row with one asked amount per token; `sent` lists what arrived in each token
function invoice({ status = 'open', periods = 1, credit = 0, due, amounts, sent = [], paymentStatus = 'final' }) {
  const id = `formal-${++made}`;
  const now = Date.now();
  sql.run(
    `INSERT INTO billing_invoices (id, number, kind, periods, people, seats, base_usd, seats_usd, total_usd, credit_usd, due_usd, suffix, start_block, status, created_at, expires_at)
     VALUES (?, ?, 'periods', ?, 1, 1, ?, 0, ?, ?, ?, ?, 0, ?, ?, ?)`,
    id, 1000 + made, periods, credit + due, credit + due, credit, due, made, status, now, now + 86_400_000,
  );
  amounts.forEach((a, i) => {
    sql.run("INSERT INTO billing_amounts (invoice_id, token, symbol, decimals, amount, grid, rate, rate_source) VALUES (?, ?, ?, 6, ?, ?, '1000000000000000000', 'face')", id, TOKENS[i], `T${i}`, a.amount, a.grid);
  });
  sent.forEach((value, i) => pay(id, i, value, paymentStatus));
  return id;
}

// a confirming payment is in a block, waiting for it to be final; one a reorg took out has no
// block and doesn't count
function pay(invoiceId, token, value, status) {
  if (BigInt(value) === 0n) return;
  const tx = `0x${(++made).toString(16).padStart(64, '0')}`;
  const block = status === 'confirming' ? tx : null;
  sql.run('INSERT INTO billing_payments (id, invoice_id, tx_hash, log_index, token, amount, status, on_time, block_hash, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, 1, ?, ?)', tx, invoiceId, tx, TOKENS[token], String(value), status, block, Date.now());
}

const row = (id) => sql.get('SELECT * FROM billing_invoices WHERE id = ?', id);

test('askAmount rounds up to the grid and adds the suffix, as the model does', () => {
  for (const c of vectors.askAmount) {
    const ask = fns.askAmount(BigInt(c.minimum), BigInt(c.grid), BigInt(c.tail));
    assert.equal(ask, BigInt(c.ask), JSON.stringify(c));
    assert.ok(ask >= BigInt(c.minimum));
  }
});

test('sameSuffix agrees with the model', () => {
  for (const c of vectors.sameSuffix) assert.equal(fns.sameSuffix(c.value, c.asked, c.grid), c.same, JSON.stringify(c));
});

test('amountGrid lays amounts out on the grid the model uses', () => {
  for (const c of vectors.amountGrid) {
    assert.deepEqual(fns.amountGrid(Number(c.decimals), Number(c.digits)), { low: BigInt(c.low), grid: BigInt(c.grid) }, JSON.stringify(c));
  }
});

test('pickSuffix without a key picks what the model picks, given the same draws', () => {
  for (const c of vectors.pickSuffix) {
    const draws = c.draws.map(Number);
    let i = 0;
    const slot = c.slot && { index: Number(c.slot.index), count: Number(c.slot.count) };
    const suffix = fns.pickSuffix(new Set(c.taken.map(Number)), { digits: Number(c.digits), slot }, () => draws[i++]);
    assert.equal(suffix, c.suffix === null ? null : Number(c.suffix), JSON.stringify({ ...c, taken: c.taken.length }));
  }
});

test('usdToUnits rounds up and unitsToUsd rounds down, as the model does', () => {
  for (const c of vectors.prices) {
    assert.equal(fns.usdToUnits(Number(c.microUsd), Number(c.decimals), BigInt(c.rate)), BigInt(c.units));
    assert.equal(fns.unitsToUsd(BigInt(c.amount), Number(c.decimals), BigInt(c.rate)), Number(c.usd));
  }
});

test('coverage asks for the rest with the same suffix, and paying it finishes the invoice', () => {
  for (const c of vectors.coverage) {
    const id = invoice({ due: 10_000_000, amounts: c.tokens, sent: c.tokens.map((t) => t.sent) });
    const got = fns.coverage(row(id));
    assert.equal(got.covered, BigInt(c.covered), JSON.stringify(c));
    c.tokens.forEach((t, i) => {
      const a = got.amounts.find((x) => x.token === TOKENS[i]);
      assert.equal(a.remaining, BigInt(t.remaining));
      assert.equal(a.ask, BigInt(t.ask));
      assert.equal(a.ask % BigInt(t.grid), BigInt(t.amount) % BigInt(t.grid));
      // on its way, the top-up counts toward coverage like a settled payment
      pay(id, i, a.ask, 'confirming');
      const after = fns.coverage(row(id)).covered;
      assert.equal(after, BigInt(t.coveredAfterTopUp));
      assert.ok(after >= 1_000_000_000n);
      sql.run("DELETE FROM billing_payments WHERE invoice_id = ? AND status = 'confirming'", id);
    });
  }
});

test('settleInvoice grants the Pro time the model says, never more than was paid for', () => {
  for (const c of vectors.settle) {
    const amounts = c.due === '0' ? [] : [{ amount: c.asked, grid: '10000' }];
    const id = invoice({ status: c.open ? 'open' : 'paid', periods: Number(c.periods), credit: Number(c.credit), due: Number(c.due), amounts, sent: c.due === '0' ? [] : [c.sent] });
    fns.settleInvoice(id);
    assert.equal(row(id).granted_ms, Number(c.grantedMs), JSON.stringify(c));
    const span = BigInt(c.periods) * BigInt(c.periodDays) * 86_400_000n;
    if (c.due !== '0') assert.ok(BigInt(c.grantedMs) * BigInt(c.total) * BigInt(c.asked) <= span * (BigInt(c.credit) * BigInt(c.asked) + BigInt(c.due) * BigInt(c.sent)));
    // running it again adds nothing
    fns.settleInvoice(id);
    assert.equal(row(id).granted_ms, Number(c.grantedMs));
  }
});

test('the keyed suffix shuffle is a bijection on 1 … 10^digits − 1, whatever the key', () => {
  for (const digits of [2, 3, 4]) {
    for (const key of ['formal-key-one-0123456789abcdef', 'another-formal-key-0123456789ab']) {
      const size = 10 ** digits;
      const seen = new Set();
      for (let x = 1; x < size; x++) {
        const s = fns.permute(x, digits, key);
        assert.ok(s >= 1 && s < size);
        seen.add(s);
      }
      assert.equal(seen.size, size - 1);
    }
  }
});

test('with a key, workspaces in different slots never draw the same suffix', () => {
  const key = 'formal-key-one-0123456789abcdef';
  const count = 7;
  const capacity = Math.floor(999 / count);
  const owner = new Map();
  for (let index = 0; index < count; index++) {
    for (let r = 0; r < capacity; r++) {
      const s = fns.permute(1 + index * capacity + r, 3, key);
      assert.ok(!owner.has(s) || owner.get(s) === index);
      owner.set(s, index);
    }
  }
});
