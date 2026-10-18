import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Identity } from '@semaphore-protocol/identity';
import { Group } from '@semaphore-protocol/group';
import { poseidon2 } from 'poseidon-lite/poseidon2';
import { groth16 } from 'snarkjs';
import { Base8, Fr, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import trusteePartial from './helpers/trusteePartial.js';
import trusteeDealing from './helpers/trusteeDealing.js';
import dealVoteKey from './helpers/dealVoteKey.js';
import publishKey from './helpers/publishKey.js';
import fieldHash from '../votes/fieldHash.js';
import aggregateBallots from '../votes/encrypted/aggregateBallots.js';
import trusteeKey from '../votes/encrypted/trusteeKey.js';
import checkPartial from '../votes/encrypted/checkPartial.js';
import combineTotals from '../votes/encrypted/combineTotals.js';
import checkKnowledge from '../votes/encrypted/checkKnowledge.js';
import knowledgeChallenge from '../votes/encrypted/knowledgeChallenge.js';

const ZK = new URL('../../client/public/zk/', import.meta.url).pathname;
const KEY = JSON.parse(fs.readFileSync(new URL('../votes/ballotKey.json', import.meta.url)));
const ZSP = '0x7b575dd8e8b111c52ab1e872924d4efd4df403df';
const unit = 10n ** 18n;
const rand = () => BigInt(`0x${crypto.randomBytes(32).toString('hex')}`) % subOrder;
const str = (p) => p.map(String);

let srv;
const chain = mockChain();
const base = () => srv.base;
const names = ['owner', 'ana', 'ben', 'cy'];
const who = Object.fromEntries(names.map((n) => [n, client(base)]));
const wallets = Object.fromEntries(names.map((n) => [n, wallet()]));
const identity = Object.fromEntries(names.map((n) => [n, new Identity(`encrypted-${n}`)]));
const ids = {};
// each trustee's secret line f(x) = a0 + a1·x, kept by the test the way a browser keeps it in memory
const lines = {};

before(async () => {
  srv = await startServer({ chain });
  ids.owner = (await who.owner.wallet(wallets.owner, 'setup', { name: 'Erik', workspaceName: 'NONOS' })).data.user.id;
  for (const n of ['ana', 'ben', 'cy']) {
    const inv = await who.owner('POST', '/api/invites', { role: 'member' });
    ids[n] = (await who[n].wallet(wallets[n], 'invite', { name: n, inviteToken: inv.data.token })).data.user.id;
  }
  for (const n of names) {
    await who[n]('PUT', '/api/me/semaphore', { commitment: identity[n].commitment.toString() });
    assert.equal((await publishKey(who[n], wallets[n])).status, 200);
  }
  await who.owner('PUT', '/api/vote-power', { zspPower: '100' });
  chain.setBalance(wallets.owner.address, 1000n * unit);
  chain.setBalance(wallets.ana.address, 250n * unit);
  chain.setTokenBalance(ZSP, wallets.ana.address, 1);
  chain.setBalance(wallets.cy.address, 4000n * unit);
  chain.setStake(wallets.cy.address, 1000n * unit);
});
after(() => {
  srv.close();
  globalThis.curve_bn128?.terminate();
});

const getVote = async (id, as = 'owner') => (await who[as]('GET', '/api/proposals')).data.find((p) => p.id === id);

async function proveBallot(n, vote, choice, tamper) {
  const members = vote.anonymous.members;
  const group = new Group();
  members.forEach((m, i) => {
    group.addMember(poseidon2([BigInt(m.commitment), BigInt(m.power)]));
    if (m.removed) group.removeMember(i);
  });
  const index = members.findIndex((m) => m.commitment === identity[n].commitment.toString());
  const merkle = group.generateMerkleProof(index);
  const input = {
    secret: identity[n].secretScalar,
    power: members[index].power,
    merkleProofLength: merkle.siblings.length,
    merkleProofIndex: merkle.index,
    merkleProofSiblings: Array.from({ length: 16 }, (_, i) => merkle.siblings[i] ?? 0n),
    choice,
    randomness: Array.from({ length: 8 }, () => BigInt(`0x${crypto.randomBytes(31).toString('hex')}`) >> 1n),
    scope: fieldHash(vote.anonymous.scope),
    optionCount: vote.options.length,
    publicKey: vote.encrypted.publicKey,
    ...tamper,
  };
  return groth16.fullProve(input, `${ZK}ballot.wasm`, `${ZK}ballot.zkey`);
}
const ballot = (id, body) => fetch(`${srv.base}/api/anonymous-ballots/${id}`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() }));

test('an encrypted vote needs three trustees with encryption keys, and a census of weighted members', async () => {
  assert.equal((await who.owner('POST', '/api/proposals', { title: 'x', weighting: 'power', anonymous: true, trustees: [ids.owner, ids.ana] })).status, 400);
  // without trustees nobody could ever set up the key, and the vote would never open
  const before = (await who.owner('GET', '/api/proposals')).data.length;
  for (const trustees of [undefined, null, []]) assert.match((await who.owner('POST', '/api/proposals', { title: 'x', weighting: 'power', anonymous: true, trustees })).data.error, /three different members/);
  assert.equal((await who.owner('GET', '/api/proposals')).data.length, before);
  const res = await who.owner('POST', '/api/proposals', { title: 'Allocate the Q4 treasury', options: ['Grants', 'Buyback', 'Hold'], weighting: 'power', anonymous: true, trustees: [ids.owner, ids.ana, ids.cy] });
  assert.equal(res.status, 200);
  const vote = res.data.proposal;
  ids.vote = vote.id;
  // owner 1000, ana 250 + one ZSP at 100, cy 4000 + 1000 staked; ben holds nothing and isn't in the census
  const powerOf = (n) => vote.anonymous.members.find((m) => m.commitment === identity[n].commitment.toString())?.power;
  assert.deepEqual(['owner', 'ana', 'cy', 'ben'].map(powerOf), ['1000', '350', '5000', undefined]);
  // seats go in key order, so a seat's position says nothing about who sits in it
  const seats = vote.anonymous.members.map((m) => m.commitment);
  assert.deepEqual(seats, [...seats].sort());
  assert.equal(vote.encrypted.publicKey, null);
  assert.equal(vote.totals, null);
});

test('trustees commit before anyone reveals, and every reveal proves knowledge of its secrets', async () => {
  const vote = await getVote(ids.vote);
  assert.match((await ballot(ids.vote, await proveBallot('owner', { ...vote, encrypted: { publicKey: str(Base8) } }, 0))).data.error, /opens once its trustees/);
  const seats = [[1, 'owner'], [2, 'ana'], [3, 'cy']];
  for (const [position] of seats) lines[position] = [rand(), rand()];
  const deal = Object.fromEntries(seats.map(([position]) => [position, trusteeDealing(ids.vote, position, lines[position])]));
  const commit = (n, commitment) => who[n]('PUT', `/api/proposals/${ids.vote}/commitment`, { commitment });
  const reveal = (n, body) => who[n]('PUT', `/api/proposals/${ids.vote}/dealing`, body);

  assert.equal((await commit('ben', deal[1].commitment)).status, 403);
  assert.equal((await commit('owner', deal[1].commitment)).status, 200);
  // nobody reveals before all three have committed, and a commitment can't be swapped
  assert.equal((await reveal('owner', deal[1].reveal)).status, 409);
  assert.equal((await commit('owner', 'f'.repeat(64))).status, 409);
  assert.equal((await commit('ana', deal[2].commitment)).status, 200);
  const midway = (await getVote(ids.vote, 'ben')).encrypted;
  assert.deepEqual(midway.trustees.map((t) => t.committed), [true, true, false]);
  assert.ok(midway.commitments.every((c) => c === null));
  assert.equal((await commit('cy', deal[3].commitment)).status, 200);

  // a reveal that differs from the commitment, or whose proofs don't hold, is refused
  assert.match((await reveal('ana', deal[1].reveal)).data.error, /doesn’t match what you committed/);
  const copied = { ...deal[2].reveal, proofs: deal[1].reveal.proofs };
  assert.match((await reveal('ana', copied)).data.error, /proofs of knowledge/);
  const bent = { ...deal[2].reveal, proofs: [{ ...deal[2].reveal.proofs[0], z: '1' }, deal[2].reveal.proofs[1]] };
  assert.match((await reveal('ana', bent)).data.error, /proofs of knowledge/);
  for (const [position, n] of seats) assert.equal((await reveal(n, deal[position].reveal)).status, 200);
  assert.equal((await reveal('owner', deal[1].reveal)).status, 409);

  // every member, trustee or not, gets the commitments and proofs to rebuild the key with
  const ready = (await getVote(ids.vote, 'ben')).encrypted;
  assert.equal(ready.dealings, null);
  assert.deepEqual(ready.commitments, seats.map(([position]) => ({ commitments: deal[position].reveal.commitments, proofs: deal[position].reveal.proofs })));
  const expected = [1, 2, 3].reduce((sum, p) => addPoint(sum, mulPointEscalar(Base8, lines[p][0])), [0n, 1n]);
  assert.deepEqual(ready.publicKey, str(expected));
  assert.deepEqual(str(ready.commitments.reduce((sum, d) => addPoint(sum, d.commitments[0].map(BigInt)), [0n, 1n])), ready.publicKey);
});

test('a rogue trustee can’t aim the vote key at a secret only they know', () => {
  // with the others' A0 in view, the last dealer would like A0 = t·G - (A0_1 + A0_2), so the sum
  // is t·G; but then they don't know their own A0's secret, and their best proof attempt fails
  const others = [1, 2].reduce((sum, p) => addPoint(sum, mulPointEscalar(Base8, lines[p][0])), [0n, 1n]);
  const t = rand();
  const rogue = addPoint(mulPointEscalar(Base8, t), [Fr.neg(others[0]), others[1]]);
  const w = rand();
  const T = mulPointEscalar(Base8, w);
  const c = knowledgeChallenge(ids.vote, 3, 0, [Base8, rogue, T]);
  assert.equal(checkKnowledge(ids.vote, 3, 0, rogue, { t: str(T), z: ((w + c * t) % subOrder).toString() }), false);
  // the same proof for an honest commitment holds, and doesn't carry over to another seat
  const honest = mulPointEscalar(Base8, t);
  const ch = knowledgeChallenge(ids.vote, 3, 0, [Base8, honest, T]);
  const proof = { t: str(T), z: ((w + ch * t) % subOrder).toString() };
  assert.equal(checkKnowledge(ids.vote, 3, 0, honest, proof), true);
  assert.equal(checkKnowledge(ids.vote, 2, 0, honest, proof), false);
});

test('trustees check the shares dealt to them before any ballot is cast', async () => {
  assert.equal((await who.ben('POST', `/api/proposals/${ids.vote}/shares-check`, { ok: true })).status, 403);
  for (const n of ['owner', 'ana', 'cy']) assert.equal((await who[n]('POST', `/api/proposals/${ids.vote}/shares-check`, { ok: true })).status, 200);
  const vote = (await getVote(ids.vote, 'ben')).encrypted;
  assert.deepEqual(vote.trustees.map((t) => t.shares), ['ok', 'ok', 'ok']);
  assert.equal(vote.disputed, false);
});

test('weighted ballots are proven and encrypted; nobody sees totals before decryption', async () => {
  const vote = await getVote(ids.vote);
  for (const [n, choice] of [['owner', 0], ['ana', 1], ['cy', 0]]) {
    const res = await ballot(ids.vote, await proveBallot(n, vote, choice));
    assert.equal(res.status, 200);
    // counted with the rest of its hour, once the hour and five minutes' grace are over
    assert.equal((res.data.countsAt - 300_000) % 3_600_000, 0);
  }
  // the circuit can't name an hour, so a copy of an old ballot couldn't be told from a change of
  // mind: an encrypted ballot is final, and a second one from Ana, or a copy of it, is refused
  const again = await proveBallot('ana', vote, 2);
  const refused = await ballot(ids.vote, again);
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /final/);
  // held until the hour ends: nothing anyone can see moves when a ballot arrives
  const now = await getVote(ids.vote);
  assert.deepEqual([now.voters, now.totals, now.anonymous.nullifiers.length], [0, null, 0]);
});

test('forged and misdirected ballots are refused', async () => {
  const vote = await getVote(ids.vote);
  const good = await proveBallot('owner', vote, 1);
  const swapped = [...good.publicSignals];
  [swapped[2], swapped[18]] = [swapped[18], swapped[2]];
  assert.match((await ballot(ids.vote, { ...good, publicSignals: swapped })).data.error, /doesn’t verify/);
  // a member who lies about their power can't build a leaf that's in the census
  assert.match((await ballot(ids.vote, await proveBallot('owner', vote, 1, { power: 999999n }))).data.error, /voter list changed/);
  const otherKey = str(mulPointEscalar(Base8, 7n));
  assert.match((await ballot(ids.vote, await proveBallot('owner', { ...vote, encrypted: { publicKey: otherKey } }, 1))).data.error, /different key/);
  assert.match((await ballot(ids.vote, await proveBallot('owner', { ...vote, options: ['a', 'b'] }, 1))).data.error, /different set of options/);
  await assert.rejects(proveBallot('owner', vote, 5));
});

const partialFor = (position, aggregates) => trusteePartial(lines, position, aggregates);

test('after closing, two trustees decrypt the totals with proofs, and a bad partial is refused', async () => {
  assert.equal((await who.ana('POST', `/api/proposals/${ids.vote}/partial`, {})).status, 400);
  await who.owner('POST', `/api/proposals/${ids.vote}/close`);
  const closed = await getVote(ids.vote, 'ana');
  assert.equal(closed.totals, null);
  assert.equal((await getVote(ids.vote, 'ben')).encrypted.aggregates, null);
  const aggregates = closed.encrypted.aggregates;

  assert.equal((await who.ana('POST', `/api/proposals/${ids.vote}/partial`, partialFor(2, aggregates))).status, 200);
  assert.equal((await getVote(ids.vote)).totals, null);
  // Cy hands in Ana's numbers: they don't match Cy's public share
  assert.equal((await who.cy('POST', `/api/proposals/${ids.vote}/partial`, partialFor(2, aggregates))).status, 400);
  assert.equal((await who.ben('POST', `/api/proposals/${ids.vote}/partial`, partialFor(3, aggregates))).status, 403);
  assert.equal((await who.cy('POST', `/api/proposals/${ids.vote}/partial`, partialFor(3, aggregates))).status, 200);

  const done = await getVote(ids.vote);
  // Grants: owner 1000 + cy 5000; Buyback: Ana 350, whose first ballot stood; Hold: nobody
  assert.deepEqual(done.totals, [6000n * unit, 350n * unit, 0n].map(String));
  assert.equal(done.voters, 3);
});

test('the audit file lets anyone re-verify every ballot and redo the decryption', async () => {
  const audit = (await who.owner('GET', `/api/proposals/${ids.vote}/audit`)).data;
  assert.equal(audit.type, 'nonos.encrypted-vote-audit');
  for (const n of ['Erik', 'ana', 'cy']) assert.ok(!JSON.stringify(audit).includes(`"${n}"`));
  const roots = new Set(audit.roots.filter((r) => !r.revoked).map((r) => r.root));
  assert.equal(audit.ballots.length, 3);
  for (const b of audit.ballots) {
    assert.match(b.castAt, /T\d\d:00:00\.000Z$/);
    assert.equal(await groth16.verify(KEY, b.publicSignals, b.proof), true);
    assert.ok(roots.has(b.publicSignals[0]));
    assert.equal(b.publicSignals[34], audit.circuit.scope);
  }
  const dealings = audit.trustees.map((t) => t.commitments.map((c) => c.map(BigInt)));
  const aggregates = aggregateBallots(audit.ballots.map((b) => b.ciphertexts), audit.proposal.options.length);
  const partials = audit.trustees.filter((t) => t.partial).map((t) => ({ position: t.position, d: checkPartial(trusteeKey(dealings, t.position), aggregates, t.partial) }));
  assert.ok(partials.every((p) => p.d));
  const bound = audit.census.reduce((sum, m) => sum + BigInt(m.power), 0n);
  assert.deepEqual(combineTotals(aggregates, partials, bound).map((t) => String(t * unit)), audit.proposal.result.totals);
});

test('a trustee who finds a bad share stops the vote from taking ballots', async () => {
  const res = await who.owner('POST', '/api/proposals', { title: 'Second encrypted vote', options: ['A', 'B'], weighting: 'power', anonymous: true, trustees: [ids.owner, ids.ana, ids.cy] });
  const id = res.data.proposal.id;
  const { responses } = await dealVoteKey(id, [[1, who.owner], [2, who.ana], [3, who.cy]]);
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal((await who.cy('POST', `/api/proposals/${id}/shares-check`, { ok: false, from: 7 })).status, 400);
  assert.equal((await who.cy('POST', `/api/proposals/${id}/shares-check`, { ok: false, from: 1 })).status, 200);
  const vote = await getVote(id, 'ben');
  assert.equal(vote.encrypted.disputed, true);
  assert.deepEqual(vote.encrypted.trustees.map((t) => t.shares), [null, null, 'bad']);
  const refused = await ballot(id, {});
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /can’t take ballots/);
});
