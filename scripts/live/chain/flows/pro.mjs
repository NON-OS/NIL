import assert from 'node:assert/strict';
import calls from '../calls.mjs';
import mainnet from '../mainnet.mjs';
import waitFor from '../waitFor.mjs';

const DAY = 86_400_000;
const USDC_UNIT = 10n ** 6n;
// Nil allows an admin 60 billing requests a minute, so the checks here ask every two seconds
const SLOW = 2000;

// Nil Pro: invoices priced in USD and paid in real USDC and NOX by someone other than the admin,
// found on the treasury by the scan or named by the admin, counted once final, and followed
// through a reorg. Seats, paid time,
// NOX priced from the real Uniswap V2 pair once a window is recorded, credit from an underpaid
// invoice that was cancelled, and a payment that lands after its invoice expired.
export default async function pro(ctx) {
  const { chain, treasury } = ctx;
  const { owner, payer } = ctx.people;
  const api = owner.api;
  const status = () => api.get('/plan');
  const invoice = async (body = {}) => (await api.post('/plan/invoices', body)).invoice;
  const view = async (id) => (await api.get(`/plan/invoices/${id}`)).invoice;
  const amountOf = (inv, symbol) => inv.amounts.find((a) => a.symbol === symbol);
  const tokenOf = (symbol) => (symbol === 'USDC' ? mainnet.usdc : mainnet.nox);
  const reaches = (id, state) => waitFor(async () => {
    const now = await view(id);
    return now.state === state ? now : null;
  }, { what: `invoice to be ${state}`, timeoutMs: 60_000, every: SLOW });
  const send = async (symbol, value) => (await chain.receipt(await payer.wallet.transfer(tokenOf(symbol), treasury.address, value))).transactionHash;

  const before = await status();
  assert.deepEqual([before.enforced, before.unlocked, before.seatsUsed], [true, false, 5]);
  await api.post('/invites', { role: 'member' }, { expect: 402 });

  // USDC, exactly, from a wallet that isn't the admin's: the scan finds it with no help
  const first = await invoice({ periods: 1, people: 8 });
  const usdc = amountOf(first, 'USDC');
  const nox = amountOf(first, 'NOX');
  assert.equal(nox.rateSource, 'manual', 'no whole TWAP window recorded yet');
  await send('USDC', BigInt(usdc.amount));
  await reaches(first.id, 'confirming');
  await chain.finalize();
  await reaches(first.id, 'paid');
  const paid = await status();
  assert.equal(paid.unlocked, true);
  assert.equal(paid.seatLimit, 8);
  assert.ok(Math.abs(paid.paidUntil - (Date.now() + 30 * DAY)) < DAY, 'thirty days of Pro');

  // once the recorder has a reading a whole window old, NOX is priced from the pair
  await new Promise((r) => setTimeout(r, 4000));
  await chain.mine(26, 12);
  const quote = await api.get('/plan/quote');
  const live = quote.tokens.find((t) => t.symbol === 'NOX');
  assert.equal(live.rateSource, 'oracle');
  const usd = Number(BigInt(live.rate) / 10n ** 9n) / 1e9;
  assert.ok(Math.abs(usd / ctx.spot - 1) < 0.01, `pair TWAP $${usd} against spot $${ctx.spot}`);

  // NOX at that rate, sent by the payer and named by the admin
  const second = await invoice({ periods: 1, people: 8 });
  const noxAmount = amountOf(second, 'NOX');
  assert.equal(noxAmount.rateSource, 'oracle');
  const named = await send('NOX', BigInt(noxAmount.amount));
  await api.post(`/plan/invoices/${second.id}/transactions`, { txHash: named });
  await chain.finalize();
  await reaches(second.id, 'paid');
  assert.ok(Math.abs((await status()).paidUntil - (Date.now() + 60 * DAY)) < DAY, 'sixty days of Pro');


  // a reorg takes the payment's block away before it's final: the payment is kept, without a
  // block, and counts again when the same transaction lands again
  const reorged = await invoice({ periods: 1, people: 8 });
  const snapshot = await chain.snapshot();
  const raw = await payer.wallet.sign({ to: mainnet.usdc, data: calls.transfer(treasury.address, BigInt(amountOf(reorged, 'USDC').amount)) });
  await chain.receipt(await payer.wallet.broadcast(raw));
  await reaches(reorged.id, 'confirming');
  await chain.revert(snapshot);
  await chain.syncClock();
  await chain.mine(2);
  await waitFor(async () => (await view(reorged.id)).payments.some((p) => p.status === 'confirming' && p.blockNumber === null), { what: 'the payment to lose its block in the reorg', every: SLOW });
  await payer.wallet.broadcast(raw);
  await reaches(reorged.id, 'confirming');
  await chain.finalize();
  await reaches(reorged.id, 'paid');

  // two more seats for the rest of the paid time
  const seats = await invoice({ kind: 'seats', people: 10 });
  await send('USDC', BigInt(amountOf(seats, 'USDC').amount));
  await chain.finalize();
  await reaches(seats.id, 'paid');
  assert.equal((await status()).seatLimit, 10);

  // a dollar short, named: underpaid, cancelled, and what arrived becomes credit
  const short = await invoice({ periods: 1, people: 10 });
  const shortAmount = BigInt(amountOf(short, 'USDC').amount) - USDC_UNIT;
  await api.post(`/plan/invoices/${short.id}/transactions`, { txHash: await send('USDC', shortAmount) });
  await chain.finalize();
  const under = await reaches(short.id, 'underpaid');
  assert.equal(amountOf(under, 'USDC').shortfall, String(USDC_UNIT));
  // an invoice can't be cancelled while its payment is still on its way
  await waitFor(async () => (await view(short.id)).payments.every((p) => p.status === 'final'), { what: 'the short payment to be final', every: SLOW });
  await api.post(`/plan/invoices/${short.id}/cancel`);
  const credit = (await api.get('/plan/invoices')).credit;
  assert.ok(credit > 0, 'the cancelled invoice’s money is credit');
  const next = await invoice({ periods: 1, people: 10 });
  assert.equal(next.price.creditUsd, Math.min(credit, next.price.totalUsd));
  await api.post(`/plan/invoices/${next.id}/cancel`);

  // an invoice whose window passes, paid exactly but too late: it counts as credit instead
  const late = await invoice({ periods: 1, people: 10 });
  const db = await ctx.db();
  db.prepare('UPDATE billing_invoices SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, late.id);
  db.close();
  await waitFor(async () => (await view(late.id)).status === 'expired', { what: 'the invoice to expire', every: SLOW });
  const creditBefore = (await api.get('/plan/invoices')).credit;
  await chain.syncClock();
  await send('USDC', BigInt(amountOf(late, 'USDC').amount));
  await chain.finalize();
  const afterLate = await waitFor(async () => {
    const v = await view(late.id);
    return v.payments.some((p) => p.status === 'final') ? v : null;
  }, { what: 'the late payment to settle', every: SLOW });
  assert.equal(afterLate.payments.find((p) => p.status === 'final').onTime, false);
  assert.ok((await api.get('/plan/invoices')).credit > creditBefore, 'a late payment adds to the credit');
}
