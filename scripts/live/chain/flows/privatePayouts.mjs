import assert from 'node:assert/strict';
import { secp256k1 } from '@noble/curves/secp256k1';
import calls from '../calls.mjs';
import mainnet from '../mainnet.mjs';
import waitFor from '../waitFor.mjs';
import stealthKeys from '../stealthKeys.mjs';
import signTransaction from '../signTransaction.mjs';

const NOX = 10n ** 18n;
const ANNOUNCEMENT = '0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7';

// Private payouts (ERC-5564): the payer pays a one-time address, announces it and tops it up
// with gas money; the contributor finds it from the chain alone and moves everything out through
// Nil's relay. Once from a plain wallet in three transactions, once from a smart wallet in one
// atomic batch.
export default async function privatePayouts(ctx) {
  const { chain } = ctx;
  const { owner, member, smart } = ctx.people;
  const spendingKey = secp256k1.utils.randomPrivateKey();
  const viewingKey = secp256k1.utils.randomPrivateKey();
  const meta = stealthKeys.meta(spendingKey, viewingKey);
  await member.api.put('/me/stealth', { metaAddress: meta });
  const boot = await owner.api.get('/bootstrap');
  const topUp = BigInt(boot.stealth.gasTopUpWei);
  assert.equal(boot.stealth.announcer, mainnet.announcer);

  // the smart-wallet member pays as an admin too
  await owner.api.patch(`/users/${smart.id}`, { role: 'admin' });

  const pay = async (payer, bounty, { batch }) => {
    const t = (await owner.api.post('/tasks', { title: `Private ${Date.now()}`, assigneeId: member.id, bounty: String(bounty) })).task;
    // the payer's side works out the one-time address; Nil gets it with public values only
    const one = stealthKeys.pay(meta);
    const intent = (await payer.api.post(`/tasks/${t.id}/payments/intent`, { stealth: one })).intent;
    assert.ok(intent.stealth);
    assert.equal(intent.to, one.address, 'Nil asks for the address the payer worked out');
    assert.notEqual(intent.to, member.wallet.address, 'a private payout never goes to the contributor’s own wallet');
    const opened = stealthKeys.open(spendingKey, viewingKey, intent.ephemeralPublicKey);
    assert.equal(opened.address, intent.to, 'the contributor can open the address');
    assert.equal(opened.viewTag, intent.viewTag);
    const amount = BigInt(intent.amount);
    const announce = stealthKeys.announceData({ stealthAddress: intent.to, ephemeralPublicKey: intent.ephemeralPublicKey, viewTag: intent.viewTag, token: mainnet.nox, amount });
    let payment;
    if (batch) {
      const hash = await payer.wallet.sendCalls([{ to: mainnet.nox, data: calls.transfer(intent.to, amount) }, { to: mainnet.announcer, data: announce }, { to: intent.to, value: topUp }]);
      await chain.receipt(hash);
      payment = (await payer.api.post(`/tasks/${t.id}/payments`, { intentId: intent.id, txHash: hash, announceTx: hash })).payment;
    } else {
      const transfer = (await chain.receipt(await payer.wallet.transfer(mainnet.nox, intent.to, amount))).transactionHash;
      payment = (await payer.api.post(`/tasks/${t.id}/payments`, { intentId: intent.id, txHash: transfer })).payment;
      const announced = (await chain.receipt(await payer.wallet.send({ to: mainnet.announcer, data: announce }))).transactionHash;
      await payer.api.post(`/payments/${payment.id}/announce`, { txHash: announced });
      await chain.receipt(await payer.wallet.sendEth(intent.to, topUp));
    }
    await chain.finalize();
    await waitFor(async () => {
      const p = (await payer.api.post(`/payments/${payment.id}/check`)).payment;
      return p.state === 'paid' && p.announced ? p : null;
    }, { what: 'the private payout to be paid and announced' });
    return { intent, amount };
  };

  const plain = await pay(owner, 40n * NOX, { batch: false });
  const batched = await pay(smart, 15n * NOX, { batch: true });

  // the contributor finds both from the announcements alone, by view tag, with no help from Nil
  const logs = await chain.rpc('eth_getLogs', [{ address: mainnet.announcer, topics: [ANNOUNCEMENT, `0x${calls.word(1n)}`], fromBlock: `0x${((await chain.forkBlock()) + 1).toString(16)}`, toBlock: 'latest' }]);
  const found = logs.flatMap((log) => {
    const data = log.data.slice(2);
    const at = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
    const eph = `0x${data.slice(at + 64, at + 64 + 66)}`;
    const metaAt = Number(BigInt(`0x${data.slice(64, 128)}`)) * 2;
    const tag = parseInt(data.slice(metaAt + 64, metaAt + 66), 16);
    const mine = stealthKeys.open(spendingKey, viewingKey, eph);
    return mine.viewTag === tag && mine.address === `0x${log.topics[2].slice(-40)}` ? [mine] : [];
  });
  assert.deepEqual(new Set(found.map((f) => f.address)), new Set([plain.intent.to, batched.intent.to]));

  // and moves each one out the way the app does: tokens first, then what's left of the ETH
  const payouts = (await member.api.get('/stealth/payouts')).payouts;
  for (const { intent, amount } of [plain, batched]) {
    const payout = payouts.find((p) => p.address === intent.to);
    assert.ok(payout, 'the payout is listed for the contributor');
    const { balance } = await member.api.get(`/stealth/payouts/${payout.id}/balance`);
    assert.equal(BigInt(balance.token), amount);
    assert.equal(BigInt(balance.eth), topUp);
    const { privateKey } = stealthKeys.open(spendingKey, viewingKey, payout.ephemeralPublicKey);
    const before = BigInt(await chain.rpc('eth_call', [{ to: mainnet.nox, data: calls.balanceOf(member.wallet.address) }, 'latest']));
    const data = calls.transfer(member.wallet.address, amount);
    const p1 = await member.api.post('/stealth/prepare', { from: intent.to, to: mainnet.nox, data, value: '0' });
    assert.ok(BigInt(p1.maxPriorityFeePerGas) > 0n, 'a sweep never offers a zero tip');
    const spent = BigInt(p1.gas) * BigInt(p1.maxFeePerGas);
    const sign = (p, nonce, tx) => signTransaction(privateKey, { chainId: p.chainId, nonce, gas: p.gas, maxFeePerGas: p.maxFeePerGas, maxPriorityFeePerGas: p.maxPriorityFeePerGas, ...tx });
    const moved = (await member.api.post('/stealth/broadcast', { raw: sign(p1, p1.nonce, { to: mainnet.nox, data, value: 0n }) })).txHash;
    assert.equal((await chain.receipt(moved)).status, '0x1');
    const p2 = await member.api.post('/stealth/prepare', { from: intent.to, to: member.wallet.address, data: '0x', value: '0' });
    const rest = BigInt(p2.balance) - BigInt(p2.gas) * BigInt(p2.maxFeePerGas);
    assert.ok(rest > 0n && BigInt(p2.balance) >= topUp - spent);
    const swept = (await member.api.post('/stealth/broadcast', { raw: sign(p2, p1.nonce + 1, { to: member.wallet.address, data: '0x', value: rest }) })).txHash;
    assert.equal((await chain.receipt(swept)).status, '0x1');
    const after = BigInt(await chain.rpc('eth_call', [{ to: mainnet.nox, data: calls.balanceOf(member.wallet.address) }, 'latest']));
    assert.equal(after - before, amount);
    assert.equal(BigInt(await chain.rpc('eth_call', [{ to: mainnet.nox, data: calls.balanceOf(intent.to) }, 'latest'])), 0n);
  }

  // the relay refuses to send for an address that isn't one of the caller's payouts
  const stranger = secp256k1.utils.randomPrivateKey();
  const raw = signTransaction(stranger, { chainId: ctx.chainId, nonce: 0, gas: 21000n, maxFeePerGas: 10n ** 10n, maxPriorityFeePerGas: 10n ** 9n, to: member.wallet.address, value: 0n, data: '0x' });
  await member.api.post('/stealth/broadcast', { raw }, { expect: 403 });
}
