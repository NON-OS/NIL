import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Identity } from '@semaphore-protocol/identity';
import { Group } from '@semaphore-protocol/group';
import { poseidon2 } from 'poseidon-lite/poseidon2';
import { groth16 } from 'snarkjs';
import { Base8, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import trusteePartial from './helpers/trusteePartial.js';
import fieldHash from '../votes/fieldHash.js';
import aggregateBallots from '../votes/encrypted/aggregateBallots.js';
import trusteeKey from '../votes/encrypted/trusteeKey.js';
import checkPartial from '../votes/encrypted/checkPartial.js';
import combineTotals from '../votes/encrypted/combineTotals.js';

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
    await who[n]('PUT', '/api/me/encryption-key', { publicKey: Buffer.from(crypto.randomBytes(32)).toString('base64url') });
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
  const res = await who.owner('POST', '/api/proposals', { title: 'Allocate the Q4 treasury', options: ['Grants', 'Buyback', 'Hold'], weighting: 'power', anonymous: true, trustees: [ids.owner, ids.ana, ids.cy] });
  assert.equal(res.status, 200);
  const vote = res.data.proposal;
  ids.vote = vote.id;
  // owner 1000, ana 250 + one ZSP at 100, cy 4000 + 1000 staked; ben holds nothing and isn't in the census
  assert.deepEqual(vote.anonymous.members.map((m) => m.power), ['1000', '350', '5000']);
  assert.equal(vote.encrypted.publicKey, null);
  assert.equal(vote.totals, null);
});

test('the vote key appears only once all three trustees have dealt, and only trustees deal', async () => {
  const vote = await getVote(ids.vote);
  assert.match((await ballot(ids.vote, await proveBallot('owner', { ...vote, encrypted: { publicKey: str(Base8) } }, 0))).data.error, /opens once its trustees/);
  const dealing = () => ({ commitments: [], shares: { 1: 'a'.repeat(123), 2: 'b'.repeat(123), 3: 'c'.repeat(123) } });
  assert.equal((await who.ben('PUT', `/api/proposals/${ids.vote}/dealing`, dealing())).status, 403);
  for (const [position, n] of [[1, 'owner'], [2, 'ana'], [3, 'cy']]) {
    lines[position] = [rand(), rand()];
    const body = { ...dealing(), commitments: lines[position].map((a) => str(mulPointEscalar(Base8, a))) };
    assert.equal((await who[n]('PUT', `/api/proposals/${ids.vote}/dealing`, body)).status, 200);
  }
  const ready = await getVote(ids.vote);
  const expected = [1, 2, 3].reduce((sum, p) => addPoint(sum, mulPointEscalar(Base8, lines[p][0])), [0n, 1n]);
  assert.deepEqual(ready.encrypted.publicKey, str(expected));
  assert.equal((await who.owner('PUT', `/api/proposals/${ids.vote}/dealing`, { ...dealing(), commitments: lines[1].map((a) => str(mulPointEscalar(Base8, a))) })).status, 409);
});

test('weighted ballots are proven and encrypted; nobody sees totals before decryption', async () => {
  const vote = await getVote(ids.vote);
  for (const [n, choice] of [['owner', 0], ['ana', 1], ['cy', 0]]) assert.equal((await ballot(ids.vote, await proveBallot(n, vote, choice))).status, 200);
  // Ana changes her mind: same nullifier, replaced, still three ballots
  assert.equal((await ballot(ids.vote, await proveBallot('ana', vote, 2))).status, 200);
  const now = await getVote(ids.vote);
  assert.deepEqual([now.voters, now.totals, now.anonymous.nullifiers.length], [3, null, 3]);
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
  // Grants: owner 1000 + cy 5000; Buyback: nobody (Ana moved); Hold: Ana 350
  assert.deepEqual(done.totals, [6000n * unit, 0n, 350n * unit].map(String));
  assert.equal(done.voters, 3);
});

test('the audit file lets anyone re-verify every ballot and redo the decryption', async () => {
  const audit = (await who.owner('GET', `/api/proposals/${ids.vote}/audit`)).data;
  assert.equal(audit.type, 'nonos.encrypted-vote-audit');
  for (const n of ['Erik', 'ana', 'cy']) assert.ok(!JSON.stringify(audit).includes(`"${n}"`));
  const roots = new Set(audit.roots.filter((r) => !r.revoked).map((r) => r.root));
  for (const b of audit.ballots) {
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
