import assert from 'node:assert/strict';
import calls from '../calls.mjs';
import mainnet from '../mainnet.mjs';
import waitFor from '../waitFor.mjs';

const NOX = 10n ** 18n;

// Bounty payments in real NOX and USDC: the exact amount, an underpayment topped up, an
// overpayment, a reorg that takes the payment out of its block and its return, a stuck payment
// cancelled that lands later, and a payment from a treasury address instead of the admin's wallet.
export default async function bounties(ctx) {
  const { chain } = ctx;
  const { owner, member, payer } = ctx.people;
  const api = owner.api;

  const task = async (bounty, bountyToken) => (await api.post('/tasks', { title: `Bounty ${Date.now()}`, assigneeId: member.id, bounty: String(bounty), ...(bountyToken ? { bountyToken } : {}) })).task;
  const intent = async (t) => (await api.post(`/tasks/${t.id}/payments/intent`, {})).intent;
  const record = async (t, i, txHash) => (await api.post(`/tasks/${t.id}/payments`, { intentId: i.id, txHash })).payment;
  const check = async (p) => (await api.post(`/payments/${p.id}/check`)).payment;
  const bountyState = async (t) => (await api.get(`/tasks/${t.id}/detail`)).task.bountyState;
  const tokenOf = (symbol) => (symbol === 'USDC' ? mainnet.usdc : mainnet.nox);
  // the background job settles it on its own once the block is final; this waits for that
  const settled = (p, state) => waitFor(async () => ((await check(p)).state === state ? p : null), { what: `payment ${p.id} to be ${state}` });

  // the exact amount, from the admin's own wallet
  {
    const t = await task(100n * NOX);
    const i = await intent(t);
    assert.equal(i.to, member.wallet.address);
    const hash = await owner.wallet.transfer(mainnet.nox, i.to, BigInt(i.amount));
    await chain.receipt(hash);
    const p = await record(t, i, hash);
    assert.equal(p.state, 'confirming', 'a mined payment waits for finality');
    assert.equal(await bountyState(t), 'pending');
    await chain.finalize();
    await settled(p, 'paid');
    assert.equal(await bountyState(t), 'paid');
    await api.post(`/tasks/${t.id}/payments/intent`, {}, { expect: 409 });
  }

  // 10 NOX short, still carrying the suffix: counted as underpaid, then the rest is asked for
  {
    const t = await task(100n * NOX);
    const i = await intent(t);
    const short = BigInt(i.amount) - 10n * NOX;
    const p = await record(t, i, await chain.receipt(await owner.wallet.transfer(mainnet.nox, i.to, short)).then((r) => r.transactionHash));
    await chain.finalize();
    const done = await waitFor(async () => {
      const now = await check(p);
      return now.state === 'underpaid' ? now : null;
    }, { what: 'the underpayment to settle' });
    assert.equal(done.amount, String(short));
    assert.equal(await bountyState(t), 'underpaid');
    const rest = await intent(t);
    assert.ok(BigInt(rest.amount) >= 10n * NOX && BigInt(rest.amount) < 11n * NOX, `top-up asks for about 10 NOX, asked ${rest.amount}`);
    const top = await record(t, rest, (await chain.receipt(await owner.wallet.transfer(mainnet.nox, rest.to, BigInt(rest.amount)))).transactionHash);
    await chain.finalize();
    await settled(top, 'paid');
    assert.equal(await bountyState(t), 'paid');
  }

  // 5 NOX over: paid, and the record says by how much
  {
    const t = await task(50n * NOX);
    const i = await intent(t);
    const over = BigInt(i.amount) + 5n * NOX;
    const p = await record(t, i, (await chain.receipt(await owner.wallet.transfer(mainnet.nox, i.to, over))).transactionHash);
    await chain.finalize();
    await settled(p, 'overpaid');
    assert.equal(await bountyState(t), 'paid');
  }

  // a reorg drops the block the payment was in; the same signed transaction is mined again later
  {
    const t = await task(20n * NOX);
    const i = await intent(t);
    const snapshot = await chain.snapshot();
    const raw = await owner.wallet.sign({ to: mainnet.nox, data: calls.transfer(i.to, BigInt(i.amount)) });
    const hash = await owner.wallet.broadcast(raw);
    const first = await chain.receipt(hash);
    const p = await record(t, i, hash);
    assert.equal(p.state, 'confirming');
    await chain.revert(snapshot);
    await chain.mine(2);
    const dropped = await check(p);
    assert.equal(dropped.state, 'sent', 'a payment whose block was reorganised away waits again');
    assert.match(dropped.problem ?? '', /reorganisation/);
    await owner.wallet.broadcast(raw);
    const second = await chain.receipt(hash);
    assert.notEqual(second.blockHash, first.blockHash);
    assert.equal((await check(p)).state, 'confirming');
    await chain.finalize();
    await settled(p, 'paid');
  }

  // stuck: the transaction sits unmined, the admin cancels it, then it lands after all and counts
  {
    const t = await task(30n * NOX);
    const i = await intent(t);
    await chain.automine(false);
    let hash;
    try {
      hash = await owner.wallet.transfer(mainnet.nox, i.to, BigInt(i.amount));
      const p = await record(t, i, hash);
      assert.equal(p.state, 'sent');
      const cancelled = (await api.post(`/payments/${p.id}/cancel`)).payment;
      assert.equal(cancelled.state, 'cancelled');
      assert.equal(await bountyState(t), null);
      await chain.mine(1);
      await api.post(`/payments/${p.id}/cancel`, {}, { expect: 400 });
      await chain.finalize();
      await waitFor(async () => (await bountyState(t)) === 'paid', { what: 'the cancelled payment that landed to count' });
    } finally {
      await chain.automine(true);
    }
  }

  // USDC, sent from a treasury address (a multisig in real life) rather than the admin's wallet
  {
    await api.put('/bounties/treasury', { addresses: [payer.wallet.address] });
    const t = await task(25_000_000n, 'USDC');
    const i = await intent(t);
    assert.equal(i.token, 'USDC');
    const p = await record(t, i, (await chain.receipt(await payer.wallet.transfer(tokenOf('USDC'), i.to, BigInt(i.amount)))).transactionHash);
    await chain.finalize();
    await settled(p, 'paid');
    // once that address is no longer a treasury address, its money doesn't count
    await api.put('/bounties/treasury', { addresses: [] });
    const t2 = await task(1_000_000n, 'USDC');
    const i2 = await intent(t2);
    const p2 = await record(t2, i2, (await chain.receipt(await payer.wallet.transfer(tokenOf('USDC'), i2.to, BigInt(i2.amount)))).transactionHash);
    const refused = await check(p2);
    assert.equal(refused.state, 'failed');
    assert.match(refused.problem, /isn’t yours or a treasury address/);
  }
}
