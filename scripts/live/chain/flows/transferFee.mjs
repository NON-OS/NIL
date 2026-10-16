import assert from 'node:assert/strict';
import calls from '../calls.mjs';
import mainnet from '../mainnet.mjs';
import waitFor from '../waitFor.mjs';

const NOX = 10n ** 18n;
const word = (hex, i) => BigInt(`0x${hex.slice(2 + i * 64, 2 + (i + 1) * 64)}`);

// NOX's governance switches on a 1% fee for transfers between wallets, through the real token
// contract: admins are warned, and a bounty and a Nil Pro invoice paid with the exact amounts
// still count although 1% less arrives. The fee is switched back off afterwards.
export default async function transferFee(ctx) {
  const { chain, treasury } = ctx;
  const { owner, member, payer } = ctx.people;
  const before = await chain.rpc('eth_call', [{ to: mainnet.nox, data: calls.fees() }, 'latest']);
  const settings = Array.from({ length: 7 }, (_, i) => word(before, i));
  const setFees = async (transferBps) => {
    const r = await chain.receipt(await chain.as(mainnet.noxGovernor, { to: mainnet.nox, data: calls.setFees([settings[0], settings[1], transferBps, ...settings.slice(3)]) }));
    assert.equal(r.status, '0x1');
  };
  const feeShown = async () => (await owner.api.get('/bootstrap')).nox.transferFeeBps;
  const noxOf = async (address) => BigInt(await chain.rpc('eth_call', [{ to: mainnet.nox, data: calls.balanceOf(address) }, 'latest']));

  await chain.setBalance(mainnet.noxGovernor, 10n ** 18n);
  await setFees(100n);
  try {
    await waitFor(async () => (await feeShown()) === 100, { what: 'admins to see the 1% fee' });

    // a bounty: the contributor gets 1% less, the payment counts in full
    const task = (await owner.api.post('/tasks', { title: `Fee bounty ${Date.now()}`, assigneeId: member.id, bounty: String(10n * NOX) })).task;
    const intent = (await owner.api.post(`/tasks/${task.id}/payments/intent`, {})).intent;
    const start = await noxOf(intent.to);
    const hash = (await chain.receipt(await owner.wallet.transfer(mainnet.nox, intent.to, BigInt(intent.amount)))).transactionHash;
    const arrived = (await noxOf(intent.to)) - start;
    assert.equal(arrived, BigInt(intent.amount) - BigInt(intent.amount) / 100n, 'the real token kept 1%');
    const payment = (await owner.api.post(`/tasks/${task.id}/payments`, { intentId: intent.id, txHash: hash })).payment;
    await chain.finalize();
    const paid = await waitFor(async () => {
      const p = (await owner.api.post(`/payments/${payment.id}/check`)).payment;
      return p.state === 'paid' ? p : null;
    }, { what: 'the bounty payment through the fee to count' });
    assert.deepEqual([paid.amount, paid.fee], [String(arrived), String(BigInt(intent.amount) - arrived)]);

    // a Nil Pro invoice in NOX, found by the scan
    // longer than the credit the earlier flows left, so there's something to pay
    const invoice = (await owner.api.post('/plan/invoices', { periods: 6, people: 10 })).invoice;
    const asked = BigInt(invoice.amounts.find((a) => a.symbol === 'NOX').amount);
    await chain.receipt(await payer.wallet.transfer(mainnet.nox, treasury.address, asked));
    await chain.finalize();
    const settled = await waitFor(async () => {
      const v = (await owner.api.get(`/plan/invoices/${invoice.id}`)).invoice;
      return v.status === 'paid' ? v : null;
    }, { what: 'the invoice paid through the fee', timeoutMs: 60_000, every: 2000 });
    assert.equal(settled.payments[0].fee, String(asked / 100n));
  } finally {
    await setFees(settings[2]);
  }
  await waitFor(async () => (await feeShown()) === 0, { what: 'the notice to go once the fee is off' });
}
