import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Group } from '@semaphore-protocol/group';
import { poseidon2 } from 'poseidon-lite/poseidon2';
import { groth16 } from 'snarkjs';
import calls from '../calls.mjs';
import mainnet from '../mainnet.mjs';
import trusteeBrowser from '../trusteeBrowser.mjs';
import publishKey from '../../../../server/test/helpers/publishKey.js';
import fieldHash from '../../../../server/votes/fieldHash.js';

const NOX = 10n ** 18n;
const ZK = fileURLToPath(new URL('../../../../client/public/zk/', import.meta.url));
const word = (hex, i = 0) => BigInt(`0x${hex.slice(2 + i * 64, 2 + (i + 1) * 64) || '0'}`);

// An encrypted ballot proven the way client/src/lib/ballot/proveEncryptedBallot.ts proves one,
// from the voter list fetched without the cookie and the key rebuilt from the trustees' dealings,
// with the circuit files read from disk instead of fetched.
function prove(semaphore, view, choice, publicKey) {
  const group = new Group();
  view.members.forEach((m, i) => {
    group.addMember(poseidon2([BigInt(m.commitment), BigInt(m.power)]));
    if (m.removed) group.removeMember(i);
  });
  const index = view.members.findIndex((m) => m.commitment === semaphore.commitment.toString());
  const merkle = group.generateMerkleProof(index);
  return groth16.fullProve(
    {
      secret: semaphore.secretScalar,
      power: view.members[index].power,
      merkleProofLength: merkle.siblings.length,
      merkleProofIndex: merkle.index,
      merkleProofSiblings: Array.from({ length: 16 }, (_, i) => merkle.siblings[i] ?? 0n),
      choice,
      randomness: Array.from({ length: 8 }, () => BigInt(`0x${crypto.randomBytes(31).toString('hex')}`) >> 1n),
      scope: fieldHash(view.scope),
      optionCount: view.optionCount,
      publicKey,
    },
    `${ZK}ballot.wasm`,
    `${ZK}ballot.zkey`,
  );
}

// Voting power from the chain: NOX held, NOX staked and Zero-State Passes, read for every member
// at one block when a weighted vote opens. A signed vote, with ballots from plain wallets and a
// smart wallet, and an anonymous encrypted vote whose census carries the same on-chain power,
// set up, cast and decrypted the way the members' browsers do it.
export default async function votes(ctx) {
  const { chain } = ctx;
  const { owner, staker, member, smart } = ctx.people;
  const zspPower = BigInt((await owner.api.get('/vote-power')).zspPower);

  // what the chain says one wallet holds at a block, the way anyone can check the audit file
  const holdingsAt = async (address, block) => {
    const tag = `0x${block.toString(16)}`;
    const read = async (to, data) => word(await chain.rpc('eth_call', [{ to, data }, tag]));
    const [nox, staked, passes] = await Promise.all([read(mainnet.nox, calls.balanceOf(address)), read(mainnet.staking, calls.getStakeInfo(address)), read(mainnet.zsp, calls.balanceOf(address))]);
    return { nox, staked, passes, power: nox + staked + passes * zspPower * NOX };
  };

  // signed and weighted
  const { proposal } = await owner.api.post('/proposals', { title: 'Fund the audit', options: ['Fund', 'Wait'], weighting: 'power' });
  const sign = async (who, choice) => {
    const ballot = await who.api.post(`/proposals/${proposal.id}/ballot`, { choice });
    return who.api.post(`/proposals/${proposal.id}/vote`, { ballotId: ballot.ballotId, signature: await who.wallet.signMessage(ballot.message), address: who.wallet.address });
  };
  await sign(owner, 0);
  await sign(staker, 1);
  await sign(smart, 0);
  await owner.api.post(`/proposals/${proposal.id}/close`);
  const audit = await owner.api.get(`/proposals/${proposal.id}/audit`);
  assert.equal(audit.v, 2);
  // each ballot carries its voter's wallets as read at the snapshot block: every one of them, and
  // the power they add up to, has to be what the chain says at that block
  for (const who of [owner, staker, smart]) {
    const ballot = audit.ballots.find((b) => b.address === who.wallet.address.toLowerCase());
    assert.ok(ballot?.snapshot, `${who.wallet.address} has a ballot with its snapshot`);
    const { snapshot } = ballot;
    assert.deepEqual(snapshot.wallets.map((w) => w.address), [who.wallet.address.toLowerCase()]);
    const sum = { nox: 0n, staked: 0n, passes: 0n, power: 0n };
    for (const w of snapshot.wallets) {
      const chainSays = await holdingsAt(w.address, audit.power.block);
      assert.deepEqual([w.nox, w.staked, BigInt(w.zsp)], [String(chainSays.nox), String(chainSays.staked), chainSays.passes], `${w.address} at block ${audit.power.block}`);
      for (const k of Object.keys(sum)) sum[k] += chainSays[k];
    }
    assert.deepEqual([snapshot.nox, snapshot.staked, BigInt(snapshot.zsp), snapshot.power, ballot.weight], [String(sum.nox), String(sum.staked), sum.passes, String(sum.power), String(sum.power)]);
  }
  // only voters appear: the member who didn't vote isn't listed, and nor are their wallets
  assert.equal(JSON.stringify(audit).includes(member.wallet.address.toLowerCase()), false);
  const stakerPower = await holdingsAt(staker.wallet.address, audit.power.block);
  assert.ok(stakerPower.staked > 0n && stakerPower.passes === 2n, 'the staker’s power has staked NOX and two passes in it');
  const checks = Object.fromEntries(audit.ballots.map((b) => [b.address, b.signatureCheck]));
  assert.deepEqual([checks[owner.wallet.address.toLowerCase()], checks[smart.wallet.address.toLowerCase()]], ['ecrecover', 'eip1271']);

  // anonymous, encrypted and weighted: three trustees hold the key, ballots are proofs
  const voters = [owner, staker, member];
  const browsers = new Map();
  for (const v of voters) {
    const browser = await trusteeBrowser(v);
    browsers.set(v, browser);
    await v.api.put('/me/semaphore', { commitment: browser.semaphore.commitment.toString() });
    const published = await publishKey(v.api.raw, { address: v.wallet.address, sign: (m) => v.wallet.signMessage(m) }, { publicKey: browser.publicKey, signingKey: browser.signingKey });
    assert.equal(published.status, 200, JSON.stringify(published.data));
  }
  const created = await owner.api.post('/proposals', { title: 'Treasury split', options: ['Grants', 'Hold'], weighting: 'power', anonymous: true, trustees: voters.map((v) => v.id) });
  const vote = created.proposal;
  const census = (v) => vote.anonymous.members.find((m) => m.commitment === browsers.get(v).semaphore.commitment.toString());
  for (const v of voters) await browsers.get(v).commit(vote.id);
  for (const v of voters) await browsers.get(v).reveal(vote.id);
  // no ballot counts until all three trustees have checked the shares dealt to them
  const early = await fetch(`${ctx.nil.base}/api/anonymous-ballots/${vote.id}`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(early.status, 409);
  for (const v of voters) await browsers.get(v).checkShares(vote.id);

  const choices = new Map([[owner, 0], [staker, 1]]);
  for (const [v, choice] of choices) await browsers.get(v).cast(ctx.nil.base, vote.id, choice, prove);
  await owner.api.post(`/proposals/${vote.id}/close`);
  for (const v of voters.slice(0, 2)) await browsers.get(v).decrypt(vote.id);
  const done = (await owner.api.get('/proposals')).find((p) => p.id === vote.id);
  const expected = [0n, 0n];
  for (const [v, choice] of choices) expected[choice] += BigInt(census(v).power) * NOX;
  assert.deepEqual(done.totals, expected.map(String), 'the decrypted totals are the voters’ on-chain power');
  // the census in the audit file carries each voter's power as the chain had it at the snapshot
  const sealed = await owner.api.get(`/proposals/${vote.id}/audit`);
  for (const v of voters) {
    const onChain = (await holdingsAt(v.wallet.address, sealed.power.block)).power / NOX;
    assert.equal(census(v)?.power ?? '0', String(onChain), 'census power is the chain’s, in whole NOX');
  }
  globalThis.curve_bn128?.terminate();
}
