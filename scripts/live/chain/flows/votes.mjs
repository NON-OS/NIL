import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Identity } from '@semaphore-protocol/identity';
import { Group } from '@semaphore-protocol/group';
import { poseidon2 } from 'poseidon-lite/poseidon2';
import { groth16 } from 'snarkjs';
import calls from '../calls.mjs';
import mainnet from '../mainnet.mjs';
import publishKey from '../../../../server/test/helpers/publishKey.js';
import dealVoteKey from '../../../../server/test/helpers/dealVoteKey.js';
import trusteePartial from '../../../../server/test/helpers/trusteePartial.js';
import fieldHash from '../../../../server/votes/fieldHash.js';

const NOX = 10n ** 18n;
const ZK = fileURLToPath(new URL('../../../../client/public/zk/', import.meta.url));
const word = (hex, i = 0) => BigInt(`0x${hex.slice(2 + i * 64, 2 + (i + 1) * 64) || '0'}`);

// Voting power from the chain: NOX held, NOX staked and Zero-State Passes, read for every member
// at one block when a weighted vote opens. A signed vote, with ballots from plain wallets and a
// smart wallet, and an anonymous encrypted vote whose census carries the same on-chain power.
export default async function votes(ctx) {
  const { chain } = ctx;
  const { owner, staker, member, smart } = ctx.people;
  const zspPower = BigInt((await owner.api.get('/vote-power')).zspPower);

  // what the chain says one member holds at a block, the way anyone can check the audit file
  const powerAt = async (address, block) => {
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
  for (const who of [owner, staker, smart]) {
    const snap = audit.power.members.find((m) => m.wallets.includes(who.wallet.address));
    const chainSays = await powerAt(who.wallet.address, audit.power.block);
    assert.deepEqual([snap.nox, snap.staked, BigInt(snap.zsp), snap.power], [String(chainSays.nox), String(chainSays.staked), chainSays.passes, String(chainSays.power)]);
  }
  const stakerPower = await powerAt(staker.wallet.address, audit.power.block);
  assert.ok(stakerPower.staked > 0n && stakerPower.passes === 2n, 'the staker’s power has staked NOX and two passes in it');
  const checks = Object.fromEntries(audit.ballots.map((b) => [b.address, b.signatureCheck]));
  assert.deepEqual([checks[owner.wallet.address], checks[smart.wallet.address]], ['ecrecover', 'eip1271']);

  // anonymous, encrypted and weighted: three trustees hold the key, ballots are proofs
  const voters = [owner, staker, member];
  const identities = new Map(voters.map((v) => [v, new Identity(crypto.randomBytes(32).toString('hex'))]));
  for (const v of voters) {
    await v.api.put('/me/semaphore', { commitment: identities.get(v).commitment.toString() });
    const published = await publishKey(v.api.raw, { address: v.wallet.address, sign: (m) => v.wallet.signMessage(m) });
    assert.equal(published.status, 200, JSON.stringify(published.data));
  }
  const created = await owner.api.post('/proposals', { title: 'Treasury split', options: ['Grants', 'Hold'], weighting: 'power', anonymous: true, trustees: voters.map((v) => v.id) });
  const vote = created.proposal;
  const census = (v) => vote.anonymous.members.find((m) => m.commitment === identities.get(v).commitment.toString());
  const { lines } = await dealVoteKey(vote.id, voters.map((v, i) => [i + 1, v.api.raw]));
  for (const v of voters) await v.api.post(`/proposals/${vote.id}/shares-check`, { ok: true });
  const ready = (await owner.api.get('/proposals')).find((p) => p.id === vote.id);

  const prove = async (v, choice) => {
    const members = ready.anonymous.members;
    const group = new Group();
    members.forEach((m, i) => {
      group.addMember(poseidon2([BigInt(m.commitment), BigInt(m.power)]));
      if (m.removed) group.removeMember(i);
    });
    const index = members.findIndex((m) => m.commitment === identities.get(v).commitment.toString());
    const merkle = group.generateMerkleProof(index);
    return groth16.fullProve({
      secret: identities.get(v).secretScalar,
      power: members[index].power,
      merkleProofLength: merkle.siblings.length,
      merkleProofIndex: merkle.index,
      merkleProofSiblings: Array.from({ length: 16 }, (_, i) => merkle.siblings[i] ?? 0n),
      choice,
      randomness: Array.from({ length: 8 }, () => BigInt(`0x${crypto.randomBytes(31).toString('hex')}`) >> 1n),
      scope: fieldHash(ready.anonymous.scope),
      optionCount: ready.options.length,
      publicKey: ready.encrypted.publicKey,
    }, `${ZK}ballot.wasm`, `${ZK}ballot.zkey`);
  };
  const choices = new Map([[owner, 0], [staker, 1]]);
  for (const [v, choice] of choices) {
    const res = await fetch(`${ctx.nil.base}/api/anonymous-ballots/${vote.id}`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(await prove(v, choice)) });
    assert.equal(res.status, 200, await res.text());
  }
  await owner.api.post(`/proposals/${vote.id}/close`);
  const closed = (await owner.api.get('/proposals')).find((p) => p.id === vote.id);
  for (const position of [1, 2]) await voters[position - 1].api.post(`/proposals/${vote.id}/partial`, trusteePartial(lines, position, closed.encrypted.aggregates));
  const done = (await owner.api.get('/proposals')).find((p) => p.id === vote.id);
  const expected = [0n, 0n];
  for (const [v, choice] of choices) expected[choice] += BigInt(census(v).power) * NOX;
  assert.deepEqual(done.totals, expected.map(String), 'the decrypted totals are the voters’ on-chain power');
  // the census in the audit file carries each voter's power as the chain had it at the snapshot
  const sealed = await owner.api.get(`/proposals/${vote.id}/audit`);
  for (const v of voters) {
    const onChain = (await powerAt(v.wallet.address, sealed.power.block)).power / NOX;
    assert.equal(census(v)?.power ?? '0', String(onChain), 'census power is the chain’s, in whole NOX');
  }
  globalThis.curve_bn128?.terminate();
}
