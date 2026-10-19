import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
let sql;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const gus = client(base);
const wallets = { owner: wallet(), ana: wallet(), ben: wallet(), gus: wallet() };
const ids = {};

before(async () => {
  srv = await startServer({ chain: mockChain() });
  sql = (await import('../db/sql.js')).default;
  await owner.wallet(wallets.owner, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  for (const [who, c] of [['ana', ana], ['ben', ben]]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    await c.wallet(wallets[who], 'invite', { name: who, inviteToken: inv.data.token });
    ids[who] = (await c('GET', '/api/bootstrap')).data.me.id;
  }
  const project = (await owner('POST', '/api/projects', { name: 'Garden' })).data.project.id;
  const guestInvite = await owner('POST', '/api/invites', { role: 'guest', projectIds: [project] });
  await gus.wallet(wallets.gus, 'invite', { name: 'Gus', inviteToken: guestInvite.data.token });
});
after(() => srv.close());

async function vote(c, w, id, choice) {
  const ballot = await c('POST', `/api/proposals/${id}/ballot`, { choice });
  return c('POST', `/api/proposals/${id}/vote`, { ballotId: ballot.data.ballotId, signature: w.sign(ballot.data.message) });
}

const seenBy = async (c, id) => (await c('GET', '/api/proposals')).data.find((p) => p.id === id);

test('with public ballots every member sees who voted what and can download the audit file', async () => {
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Fund the grants round', publicBallots: true })).data;
  assert.equal(proposal.publicBallots, true);
  assert.deepEqual(proposal.ballots, []);
  await vote(ana, wallets.ana, proposal.id, 0);
  await vote(ben, wallets.ben, proposal.id, 1);

  const seen = await seenBy(ben, proposal.id);
  assert.deepEqual(
    seen.ballots.map((b) => [b.userId, b.address, b.choice, b.weight]),
    [
      [ids.ana, wallets.ana.address, 0, '1'],
      [ids.ben, wallets.ben.address, 1, '1'],
    ],
  );
  assert.ok(seen.ballots.every((b) => Number.isInteger(b.castAt)));
  // nothing a recount doesn't need: no signed messages or signatures in the list itself
  assert.deepEqual(Object.keys(seen.ballots[0]).sort(), ['address', 'castAt', 'choice', 'userId', 'weight']);

  // a changed vote moves to its new choice and time
  await vote(ana, wallets.ana, proposal.id, 1);
  assert.deepEqual((await seenBy(ben, proposal.id)).ballots.map((b) => [b.userId, b.choice]), [[ids.ben, 1], [ids.ana, 1]]);

  const audit = await ben('GET', `/api/proposals/${proposal.id}/audit`);
  assert.equal(audit.status, 200);
  assert.equal(audit.data.ballots.length, 2);
});

test('guests reach neither the list nor the audit file', async () => {
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Members only', publicBallots: true })).data;
  await vote(ana, wallets.ana, proposal.id, 0);
  assert.equal((await gus('GET', '/api/proposals')).status, 403);
  assert.equal((await gus('GET', `/api/proposals/${proposal.id}/audit`)).status, 403);
});

test('a sealed vote shows its ballots only once it closes', async () => {
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Sealed and public', sealed: true, publicBallots: true })).data;
  await vote(ana, wallets.ana, proposal.id, 0);
  const open = await seenBy(ben, proposal.id);
  assert.equal(open.ballots, null);
  assert.equal(open.totals, null);
  assert.equal((await ben('GET', `/api/proposals/${proposal.id}/audit`)).status, 409);

  await owner('POST', `/api/proposals/${proposal.id}/close`);
  const closed = await seenBy(ben, proposal.id);
  assert.deepEqual(closed.ballots.map((b) => [b.userId, b.choice]), [[ids.ana, 0]]);
  assert.equal((await ben('GET', `/api/proposals/${proposal.id}/audit`)).status, 200);
});

test('without the setting, members see only their own choice and the audit file stays with admins', async () => {
  // the API keeps the old rule unless asked, so a caller that doesn't know the setting changes nothing
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Admins only' })).data;
  assert.equal(proposal.publicBallots, false);
  await vote(ana, wallets.ana, proposal.id, 0);
  const seen = await seenBy(ben, proposal.id);
  assert.equal(seen.ballots, null);
  assert.equal(seen.myVote, null);
  assert.equal((await ben('GET', `/api/proposals/${proposal.id}/audit`)).status, 403);
  assert.equal((await owner('GET', `/api/proposals/${proposal.id}/audit`)).status, 200);
});

test('a vote started before public ballots existed keeps its old promise', async () => {
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'From before', publicBallots: true })).data;
  await vote(ana, wallets.ana, proposal.id, 0);
  // what migration 037 leaves on every older vote
  sql.run('UPDATE proposals SET public_ballots = 0 WHERE id = ?', proposal.id);
  const seen = await seenBy(ben, proposal.id);
  assert.equal(seen.publicBallots, false);
  assert.equal(seen.ballots, null);
  assert.equal((await ben('GET', `/api/proposals/${proposal.id}/audit`)).status, 403);
});

test('anonymous votes never have public ballots, whatever is asked for', async () => {
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Secret ballot', anonymous: true, publicBallots: true })).data;
  assert.equal(proposal.publicBallots, false);
  assert.equal(proposal.ballots, null);
});
