import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Identity } from '@semaphore-protocol/identity';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import dealVoteKey from './helpers/dealVoteKey.js';
import proveAnonymous from './helpers/proveAnonymous.js';
import proveEncrypted from './helpers/proveEncrypted.js';
import castAnonymous from './helpers/castAnonymous.js';

// The auditor's proof of concept: snarkjs and Semaphore read numbers with BigInt, so "0" + n and
// n + the field order verified like n, while the server deduplicated on the raw text. One member
// could count one ballot two or three times, and an admin could replay proofs from the audit
// file with a zero in front. Every number now has one spelling.
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const unit = 10n ** 18n;

let srv;
const chain = mockChain();
const base = () => srv.base;
const names = ['owner', 'ana', 'ben', 'cy'];
const who = Object.fromEntries(names.map((n) => [n, client(base)]));
const wallets = Object.fromEntries(names.map((n) => [n, wallet()]));
const identity = Object.fromEntries(names.map((n) => [n, new Identity(`numbers-${n}`)]));
const ids = {};

before(async () => {
  srv = await startServer({ chain });
  ids.owner = (await who.owner.wallet(wallets.owner, 'setup', { name: 'Owner', workspaceName: 'W' })).data.user.id;
  for (const n of names.slice(1)) {
    const inv = await who.owner('POST', '/api/invites', { role: 'member' });
    ids[n] = (await who[n].wallet(wallets[n], 'invite', { name: n, inviteToken: inv.data.token })).data.user.id;
  }
  for (const n of names) assert.equal((await publishKey(who[n], wallets[n])).status, 200);
  for (const n of ['owner', 'ana', 'cy']) assert.equal((await who[n]('PUT', '/api/me/semaphore', { commitment: identity[n].commitment.toString() })).status, 200);
  chain.setBalance(wallets.owner.address, 1000n * unit);
  chain.setBalance(wallets.ana.address, 100n * unit);
  chain.setBalance(wallets.ben.address, 9000n * unit);
  chain.setBalance(wallets.cy.address, 5000n * unit);
});
after(() => {
  srv.close();
  globalThis.curve_bn128?.terminate();
});

const getVote = async (id) => (await who.owner('GET', '/api/proposals')).data.find((p) => p.id === id);
const spellings = (n) => ['0' + n, '00' + n, (BigInt(n) + FIELD).toString()];

test('a voting key has one spelling, so nobody can take a second seat with someone else’s key', async () => {
  const mine = identity.ana.commitment.toString();
  assert.equal((await who.ben('PUT', '/api/me/semaphore', { commitment: mine })).status, 409);
  for (const odd of spellings(mine)) assert.equal((await who.ben('PUT', '/api/me/semaphore', { commitment: odd })).status, 400);
  assert.equal((await who.ben('PUT', '/api/me/semaphore', { commitment: '-1' })).status, 400);
  // Ben's 9000 NOX never end up on a seat Ana can prove with
  const vote = (await who.owner('POST', '/api/proposals', { title: 'E', options: ['A', 'B'], weighting: 'power', anonymous: true, trustees: [ids.owner, ids.ana, ids.cy] })).data.proposal;
  assert.deepEqual(vote.anonymous.members.map((m) => m.power).sort(), ['100', '1000', '5000']);
  assert.ok(vote.anonymous.members.every((m) => m.commitment === BigInt(m.commitment).toString()));
});

test('an anonymous ballot counts once, however its numbers are written', async () => {
  const vote = (await who.owner('POST', '/api/proposals', { title: 'Anon', options: ['Yes', 'No', 'Abstain'], anonymous: true })).data.proposal;
  const proof = await proveAnonymous(identity.ana, vote, 0);
  for (const nullifier of spellings(proof.nullifier)) assert.match((await castAnonymous(srv.base, vote.id, { proof: { ...proof, nullifier } })).data.error, /malformed numbers/);
  assert.equal((await castAnonymous(srv.base, vote.id, { proof: { ...proof, merkleTreeRoot: '0' + proof.merkleTreeRoot } })).status, 400);
  assert.equal((await castAnonymous(srv.base, vote.id, { proof: { ...proof, message: '00' } })).status, 400);
  const points = [...proof.points];
  points[3] = '0' + points[3];
  assert.match((await castAnonymous(srv.base, vote.id, { proof: { ...proof, points } })).data.error, /malformed proof/);
  assert.equal((await castAnonymous(srv.base, vote.id, { proof })).status, 200);

  await who.owner('POST', `/api/proposals/${vote.id}/close`);
  const closed = await getVote(vote.id);
  assert.deepEqual([closed.voters, closed.totals], [1, ['1', '0', '0']]);
  // a recount compares nullifiers as numbers, so no spelling could slip past it either
  const audit = (await who.owner('GET', `/api/proposals/${vote.id}/audit`)).data;
  const seen = new Set(audit.ballots.map((b) => BigInt(b.proof.nullifier).toString()));
  assert.equal(seen.size, audit.ballots.length);
  for (const b of audit.ballots) assert.equal(b.proof.nullifier, BigInt(b.proof.nullifier).toString());
});

test('an encrypted ballot counts once, however its numbers are written', async () => {
  const res = await who.owner('POST', '/api/proposals', { title: 'Enc', options: ['A', 'B'], weighting: 'power', anonymous: true, trustees: [ids.owner, ids.ana, ids.cy] });
  const id = res.data.proposal.id;
  const { lines } = await dealVoteKey(id, [[1, who.owner], [2, who.ana], [3, who.cy]]);
  assert.ok(lines[1]);
  for (const n of ['owner', 'ana', 'cy']) assert.equal((await who[n]('POST', `/api/proposals/${id}/shares-check`, { ok: true })).status, 200);
  const vote = await getVote(id);
  const { proof, publicSignals } = await proveEncrypted(identity.ana, vote, 1);
  for (const nullifier of spellings(publicSignals[1])) {
    const signals = [...publicSignals];
    signals[1] = nullifier;
    assert.match((await castAnonymous(srv.base, id, { proof, publicSignals: signals })).data.error, /malformed public values/);
  }
  const bent = { ...proof, pi_a: ['0' + proof.pi_a[0], ...proof.pi_a.slice(1)] };
  assert.match((await castAnonymous(srv.base, id, { proof: bent, publicSignals })).data.error, /malformed proof/);
  assert.equal((await castAnonymous(srv.base, id, { proof, publicSignals })).status, 200);
  await who.owner('POST', `/api/proposals/${id}/close`);
  assert.equal((await getVote(id)).voters, 1);
});

test('upgrading drops ballots and voting keys that were written another way', async () => {
  const { default: migration } = await import('../db/migrations/029-vote-review.js');
  const db = new DatabaseSync(path.join(srv.dataDir, 'nonos.db'));
  try {
    const open = (await who.owner('POST', '/api/proposals', { title: 'Still open', anonymous: true })).data.proposal.id;
    const insert = db.prepare('INSERT INTO anonymous_ballots (proposal_id, nullifier, choice, proof, created_at) VALUES (?, ?, 0, ?, 0)');
    for (const nullifier of ['123', '0123', (FIELD + 5n).toString()]) insert.run(open, nullifier, '{}');
    db.exec(migration);
    assert.deepEqual(db.prepare('SELECT nullifier FROM anonymous_ballots WHERE proposal_id = ?').all(open).map((r) => r.nullifier), ['123']);
  } finally {
    db.close();
  }
});
