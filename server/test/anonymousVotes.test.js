import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Identity } from '@semaphore-protocol/identity';
import { Group } from '@semaphore-protocol/group';
import { generateProof, verifyProof } from '@semaphore-protocol/proof';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const ZK = new URL('../../client/public/zk/', import.meta.url).pathname;
const DEPTH = 16;
const artifacts = { wasm: `${ZK}semaphore-${DEPTH}.wasm`, zkey: `${ZK}semaphore-${DEPTH}.zkey` };

let srv;
const base = () => srv.base;
const owner = client(base);
const people = { ana: client(base), ben: client(base), cy: client(base), dee: client(base) };
const keys = Object.fromEntries(['owner', 'ana', 'ben', 'cy', 'dee'].map((n) => [n, new Identity(`test-secret-${n}`)]));
const ids = {};

// what a browser does: rebuild the group from the vote's member list, prove, post without cookies
const groupOf = (vote) => {
  const g = new Group();
  vote.anonymous.members.forEach((m, i) => {
    g.addMember(BigInt(m.commitment));
    if (m.removed) g.removeMember(i);
  });
  return g;
};
const prove = (who, vote, choice, group = groupOf(vote)) => generateProof(keys[who], group, choice, vote.anonymous.scope, DEPTH, artifacts);
const ballot = (proposalId, proof) =>
  fetch(`${srv.base}/api/anonymous-ballots/${proposalId}`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ proof }) }).then(async (r) => ({ status: r.status, data: await r.json() }));
const getVote = async (id) => (await owner('GET', '/api/proposals')).data.find((p) => p.id === id);

before(async () => {
  srv = await startServer();
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const [name, who] of Object.entries(people)) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[name] = (await who.wallet(wallet(), 'invite', { name, inviteToken: inv.data.token })).data.user.id;
  }
  for (const name of ['owner', 'ana', 'ben', 'cy']) {
    const who = name === 'owner' ? owner : people[name];
    assert.equal((await who('PUT', '/api/me/semaphore', { commitment: keys[name].commitment.toString() })).status, 200);
  }
});
after(() => {
  srv.close();
  globalThis.curve_bn128?.terminate();
});

test('voting keys are checked, unique, and member-only', async () => {
  assert.equal((await people.dee('PUT', '/api/me/semaphore', { commitment: 'abc' })).status, 400);
  assert.equal((await people.dee('PUT', '/api/me/semaphore', { commitment: '0' })).status, 400);
  assert.equal((await people.dee('PUT', '/api/me/semaphore', { commitment: keys.ana.commitment.toString() })).status, 409);
  const me = (await people.ana('GET', '/api/bootstrap')).data.me;
  assert.equal(me.semaphoreCommitment, keys.ana.commitment.toString());
});

test('anonymous votes are one person, one vote, and start with every member who has a key', async () => {
  assert.equal((await owner('POST', '/api/proposals', { title: 'Weighted', weighting: 'nox', anonymous: true })).status, 400);
  const res = await owner('POST', '/api/proposals', { title: 'Ship v3 on Friday?', anonymous: true });
  assert.equal(res.status, 200);
  const vote = res.data.proposal;
  ids.vote = vote.id;
  assert.equal(vote.anonymous.depth, DEPTH);
  assert.deepEqual(vote.anonymous.members.map((m) => m.commitment), ['owner', 'ana', 'ben', 'cy'].map((n) => keys[n].commitment.toString()));
  assert.equal((await people.ana('POST', `/api/proposals/${vote.id}/ballot`, { choice: 0 })).status, 400);
});

test('a ballot proves membership without saying who, counts once, and can be changed', async () => {
  let vote = await getVote(ids.vote);
  const first = await prove('ana', vote, 0);
  const res = await ballot(vote.id, first);
  assert.equal(res.status, 200);
  vote = await getVote(ids.vote);
  assert.deepEqual([vote.voters, vote.totals, vote.myVote], [1, ['1', '0', '0'], null]);
  assert.ok(vote.anonymous.nullifiers.includes(first.nullifier));

  // the same member again: same nullifier, so it replaces the first ballot instead of adding one
  const changed = await prove('ana', vote, 1);
  assert.equal(changed.nullifier, first.nullifier);
  assert.equal((await ballot(vote.id, changed)).status, 200);
  vote = await getVote(ids.vote);
  assert.deepEqual([vote.voters, vote.totals], [1, ['0', '1', '0']]);

  assert.equal((await ballot(vote.id, await prove('ben', vote, 1))).status, 200);
  assert.deepEqual((await getVote(ids.vote)).totals, ['0', '2', '0']);
});

test('forged, foreign and out-of-range ballots are refused', async () => {
  const vote = await getVote(ids.vote);
  const good = await prove('cy', vote, 2);
  const tampered = { ...good, points: good.points.map((p, i) => (i === 0 ? (BigInt(p) + 1n).toString() : p)) };
  assert.match((await ballot(vote.id, tampered)).data.error, /doesn’t verify/);
  assert.match((await ballot(vote.id, { ...good, message: '1' })).data.error, /doesn’t verify/);
  assert.match((await ballot(vote.id, await prove('cy', vote, 7))).data.error, /option doesn’t exist/);

  // someone outside the group can only prove against a group of their own making
  const outsiderGroup = groupOf(vote);
  outsiderGroup.addMember(keys.dee.commitment);
  assert.match((await ballot(vote.id, await prove('dee', vote, 0, outsiderGroup))).data.error, /voter list changed/);

  const other = (await owner('POST', '/api/proposals', { title: 'Other vote', anonymous: true })).data.proposal;
  assert.match((await ballot(other.id, good)).data.error, /different vote/);
  assert.match((await ballot(vote.id, { ...good, merkleTreeDepth: 20 })).data.error, /different circuit/);
  assert.equal((await ballot(vote.id, good)).status, 200);
});

test('late keys join open votes; removed members lose their seat and every older root', async () => {
  let vote = await getVote(ids.vote);
  const before = await prove('dee', vote, 0, (() => { const g = groupOf(vote); g.addMember(keys.dee.commitment); return g; })());
  assert.equal((await people.dee('PUT', '/api/me/semaphore', { commitment: keys.dee.commitment.toString() })).status, 200);
  vote = await getVote(ids.vote);
  assert.equal(vote.anonymous.members.at(-1).commitment, keys.dee.commitment.toString());
  // the proof Dee made against "group + Dee" now matches the real root
  assert.equal((await ballot(vote.id, before)).status, 200);

  // a key can't be swapped while it sits in an open vote
  assert.equal((await people.dee('PUT', '/api/me/semaphore', { commitment: new Identity('another').commitment.toString() })).status, 409);

  const staleCy = await prove('cy', vote, 0);
  assert.equal((await owner('PATCH', `/api/users/${ids.cy}`, { deactivated: true })).status, 200);
  vote = await getVote(ids.vote);
  assert.equal(vote.anonymous.members.find((m) => m.commitment === keys.cy.commitment.toString()).removed, true);
  assert.match((await ballot(vote.id, staleCy)).data.error, /voter list changed/);
  // the others re-prove against the new root and carry on
  assert.equal((await ballot(vote.id, await prove('ana', vote, 0))).status, 200);
});

test('closing freezes the result, and the audit lets anyone recount every proof', async () => {
  const closed = (await owner('POST', `/api/proposals/${ids.vote}/close`)).data.proposal;
  assert.ok(closed.closedAt);
  assert.equal((await ballot(ids.vote, await prove('ben', await getVote(ids.vote), 2))).status, 400);
  const audit = (await owner('GET', `/api/proposals/${ids.vote}/audit`)).data;
  assert.equal(audit.type, 'nonos.anonymous-vote-audit');
  assert.ok(!JSON.stringify(audit).includes(ids.ana));
  const nullifiers = new Set();
  const totals = audit.proposal.options.map(() => 0);
  const roots = new Set(audit.roots.map((r) => r.root));
  for (const b of audit.ballots) {
    assert.equal(await verifyProof(b.proof), true);
    assert.ok(roots.has(b.proof.merkleTreeRoot));
    assert.equal(b.proof.scope, audit.semaphore.scope);
    assert.ok(!nullifiers.has(b.proof.nullifier));
    nullifiers.add(b.proof.nullifier);
    totals[b.choice] += 1;
  }
  assert.deepEqual(totals.map(String), audit.proposal.result.totals);
  assert.deepEqual(audit.proposal.result.totals, closed.totals);
});
