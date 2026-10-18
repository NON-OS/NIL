import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Identity } from '@semaphore-protocol/identity';
import { Group } from '@semaphore-protocol/group';
import { verifyProof } from '@semaphore-protocol/proof';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import proveAnonymous from './helpers/proveAnonymous.js';

const DEPTH = 16;
const HOUR = 3_600_000;
// an hour's ballots are counted once the hour and a few minutes' grace after it are over
const GRACE = 5 * 60_000;

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
const prove = (who, vote, choice, group = groupOf(vote)) => proveAnonymous(keys[who], vote, choice, { group });
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
  // an admin can't match a voting key to a name
  const asAdmin = (await owner('GET', '/api/bootstrap')).data.users.find((u) => u.id === ids.ana);
  assert.equal(asAdmin.semaphoreCommitment, null);
});

test('anonymous votes are one person, one vote, and start with every member who has a key', async () => {
  assert.equal((await owner('POST', '/api/proposals', { title: 'Weighted', weighting: 'power', anonymous: true })).status, 400);
  const res = await owner('POST', '/api/proposals', { title: 'Ship v3 on Friday?', anonymous: true });
  assert.equal(res.status, 200);
  const vote = res.data.proposal;
  ids.vote = vote.id;
  assert.equal(vote.anonymous.depth, DEPTH);
  // seats go in key order, not join order, so a seat's position doesn't name the person in it
  assert.deepEqual(vote.anonymous.members.map((m) => m.commitment), ['owner', 'ana', 'ben', 'cy'].map((n) => keys[n].commitment.toString()).sort());
  assert.equal((await people.ana('POST', `/api/proposals/${vote.id}/ballot`, { choice: 0 })).status, 400);
});

test('a ballot proves membership without saying who, is held until its hour ends, and can be changed', async (t) => {
  // the server runs in this process, so this sets its clock too, whatever the hour really is
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  let vote = await getVote(ids.vote);
  const first = await prove('ana', vote, 0);
  const res = await ballot(vote.id, first);
  assert.equal(res.status, 200);
  // it joins the count with the rest of this hour's ballots, so its arrival time can't point to Ana
  const hour = HOUR;
  assert.equal((res.data.countsAt - GRACE) % hour, 0);
  assert.ok(res.data.countsAt > Date.now() && res.data.countsAt <= Date.now() + hour + GRACE);
  vote = await getVote(ids.vote);
  assert.deepEqual([vote.voters, vote.totals, vote.myVote, vote.anonymous.nullifiers], [0, ['0', '0', '0'], null, []]);

  // the same member again: same nullifier, so it replaces the first ballot instead of adding one
  const changed = await prove('ana', vote, 1);
  assert.equal(changed.nullifier, first.nullifier);
  assert.equal((await ballot(vote.id, changed)).status, 200);
  assert.equal((await ballot(vote.id, await prove('ben', vote, 1))).status, 200);
  assert.deepEqual((await getVote(ids.vote)).totals, ['0', '0', '0']);

  // nothing in the database knows when they arrived, or in what order
  const db = new DatabaseSync(path.join(srv.dataDir, 'nonos.db'));
  const held = db.prepare('SELECT * FROM held_ballots WHERE proposal_id = ?').all(vote.id);
  db.close();
  assert.equal(held.length, 2);
  for (const row of held) assert.equal(row.hour % hour, 0);
  assert.ok(!Object.keys(held[0]).includes('created_at'));

  // once the hour and its grace are over, the next look at the votes counts them together
  t.mock.timers.tick(hour + GRACE);
  vote = await getVote(ids.vote);
  assert.deepEqual([vote.voters, vote.totals], [2, ['0', '2', '0']]);
  assert.ok(vote.anonymous.nullifiers.includes(first.nullifier));
});

test('forged, foreign and out-of-range ballots are refused', async () => {
  const vote = await getVote(ids.vote);
  const good = await prove('cy', vote, 2);
  const tampered = { ...good, points: good.points.map((p, i) => (i === 0 ? (BigInt(p) + 1n).toString() : p)) };
  assert.match((await ballot(vote.id, tampered)).data.error, /doesn’t verify/);
  assert.match((await ballot(vote.id, { ...good, message: String(BigInt(good.message) - 1n) })).data.error, /doesn’t verify/);
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

// The auditor's proof of concept: Ben votes No, changes to Yes, and someone holding his first
// proof (the server, a proxy, or an admin with the audit file) sends it again without a cookie.
test('a copy of an earlier ballot can’t undo a change of mind, in the same hour or a later one', async (t) => {
  // the server runs in this process, so this sets its clock too, whatever the hour really is
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const vote = (await owner('POST', '/api/proposals', { title: 'Replay', anonymous: true })).data.proposal;
  const no = await prove('ben', vote, 1);
  const yes = await prove('ben', vote, 0);
  assert.equal(BigInt(no.message) / 8n, BigInt(Math.floor(Date.now() / HOUR)));
  assert.equal((await ballot(vote.id, no)).status, 200);
  assert.equal((await ballot(vote.id, yes)).status, 200);
  const replay = await ballot(vote.id, no);
  assert.equal(replay.status, 409);
  assert.match(replay.data.error, /next hour/);
  // sending the ballot that stands again changes nothing
  assert.equal((await ballot(vote.id, yes)).status, 200);
  // a proof for an hour that hasn't begun is no good either
  assert.match((await ballot(vote.id, await proveAnonymous(keys.ben, vote, 1, { hour: Math.floor(Date.now() / HOUR) + 1 }))).data.error, /another hour/);

  t.mock.timers.tick(HOUR + GRACE);
  // an hour on, Yes is counted and its proof is in the audit file, where an admin could copy it
  const audit = (await owner('GET', `/api/proposals/${vote.id}/audit`)).data;
  assert.deepEqual(audit.ballots.map((b) => b.proof.message), [yes.message]);
  for (const old of [no, yes]) assert.match((await ballot(vote.id, old)).data.error, /another hour/);
  // Ben himself can still change his mind back, with a ballot proven in this hour
  assert.equal((await ballot(vote.id, await prove('ben', vote, 1))).status, 200);
  const closed = (await owner('POST', `/api/proposals/${vote.id}/close`)).data.proposal;
  assert.deepEqual([closed.voters, closed.totals], [1, ['0', '1', '0']]);
});

test('browsers fetch the voter list without a cookie, and only the current list or one just replaced counts', async (t) => {
  // the server runs in this process, so this sets its clock too, whatever the hour really is
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const vote = (await owner('POST', '/api/proposals', { title: 'Roots', anonymous: true })).data.proposal;
  const look = () => fetch(`${srv.base}/api/anonymous-votes/${vote.id}`, { headers: { 'X-NONOS': '1' } }).then((r) => r.json());
  let view = await look();
  assert.deepEqual([view.members, view.roots, view.scope, view.optionCount, view.open], [vote.anonymous.members, vote.anonymous.roots, vote.anonymous.scope, 3, true]);
  assert.equal(view.roots.length, 1);
  assert.equal(view.now, Date.now());
  assert.equal((await fetch(`${srv.base}/api/anonymous-votes/${ids.vote}x`)).status, 404);

  const early = await prove('ana', { anonymous: view }, 0);
  const eve = client(base);
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await eve.wallet(wallet(), 'invite', { name: 'eve', inviteToken: inv.data.token });
  assert.equal((await eve('PUT', '/api/me/semaphore', { commitment: new Identity('test-secret-eve').commitment.toString() })).status, 200);
  view = await look();
  // the list Ana proved against was replaced a moment ago: still taken, for a few minutes
  assert.deepEqual(view.roots.slice(1), [early.merkleTreeRoot]);
  assert.deepEqual((await getVote(vote.id)).anonymous.roots, view.roots);
  assert.equal((await ballot(vote.id, early)).status, 200);

  // the same list a few minutes on, proven for that hour so only the list is out of date
  const later = await proveAnonymous(keys.ana, { anonymous: { ...view, members: view.members.slice(0, -1) } }, 0, { hour: Math.floor((Date.now() + 6 * 60_000) / HOUR) });
  assert.equal(later.merkleTreeRoot, early.merkleTreeRoot);
  t.mock.timers.tick(6 * 60_000);
  assert.match((await ballot(vote.id, later)).data.error, /voter list changed/);
  assert.deepEqual((await look()).roots, view.roots.slice(0, 1));
  // once the grace is over, when the list changed is kept to the hour like every other time
  await getVote(vote.id);
  const db = new DatabaseSync(path.join(srv.dataDir, 'nonos.db'));
  const replaced = db.prepare('SELECT replaced_at FROM proposal_roots WHERE proposal_id = ? AND replaced_at IS NOT NULL').all(vote.id);
  db.close();
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].replaced_at % 3_600_000, 0);
});

test('closing freezes the result, and the audit lets anyone recount every proof', async () => {
  const closed = (await owner('POST', `/api/proposals/${ids.vote}/close`)).data.proposal;
  assert.ok(closed.closedAt);
  assert.equal((await ballot(ids.vote, await prove('ben', await getVote(ids.vote), 2))).status, 400);
  const audit = (await owner('GET', `/api/proposals/${ids.vote}/audit`)).data;
  assert.equal(audit.type, 'nonos.anonymous-vote-audit');
  assert.ok(!JSON.stringify(audit).includes(ids.ana));
  // every held ballot counted at the close: Ana (last choice 0), Dee 0, Ben 1, Cy 2
  assert.deepEqual(closed.totals, ['2', '1', '1']);
  // times are whole hours and ballots list by nullifier, so neither order nor time points to a voter
  for (const time of [...audit.ballots.map((b) => b.castAt), ...audit.roots.map((r) => r.at)]) assert.match(time, /T\d\d:00:00\.000Z$/);
  const listed = audit.ballots.map((b) => b.proof.nullifier);
  assert.deepEqual(listed, [...listed].sort());
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
