import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import siwe from '../auth/siwe.js';

let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const wallets = { owner: wallet(), ana: wallet(), ben: wallet() };

before(async () => {
  srv = await startServer({ chain });
  await owner.wallet(wallets.owner, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  for (const [who, c] of [['ana', ana], ['ben', ben]]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    await c.wallet(wallets[who], 'invite', { name: who, inviteToken: inv.data.token });
  }
});
after(() => srv.close());

async function vote(c, w, id, choice) {
  const ballot = await c('POST', `/api/proposals/${id}/ballot`, { choice });
  if (ballot.status !== 200) return ballot;
  return c('POST', `/api/proposals/${id}/vote`, { ballotId: ballot.data.ballotId, signature: w.sign(ballot.data.message) });
}

test('one person, one vote: signed ballots, changeable until closed, sealed totals', async () => {
  assert.equal((await ana('POST', '/api/proposals', { title: 'Sneaky' })).status, 403);
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Adopt the Q1 roadmap', sealed: true })).data;
  assert.deepEqual(proposal.options, ['Yes', 'No', 'Abstain']);
  assert.ok((await ana('GET', '/api/notifications')).data.some((n) => n.type === 'proposal'));

  // a ballot signed by somebody else's wallet doesn't count
  const ballot = await ana('POST', `/api/proposals/${proposal.id}/ballot`, { choice: 0 });
  assert.equal((await ana('POST', `/api/proposals/${proposal.id}/vote`, { ballotId: ballot.data.ballotId, signature: wallets.ben.sign(ballot.data.message) })).status, 401);
  // and a ballot can't be used twice
  assert.equal((await ana('POST', `/api/proposals/${proposal.id}/vote`, { ballotId: ballot.data.ballotId, signature: wallets.ana.sign(ballot.data.message) })).status, 400);

  assert.equal((await vote(ana, wallets.ana, proposal.id, 1)).status, 200);
  const changed = await vote(ana, wallets.ana, proposal.id, 0);
  assert.equal(changed.data.proposal.myVote.choice, 0);
  assert.equal(changed.data.proposal.totals, null);
  await vote(ben, wallets.ben, proposal.id, 1);
  await vote(owner, wallets.owner, proposal.id, 0);

  const seen = (await ben('GET', '/api/proposals')).data.find((p) => p.id === proposal.id);
  assert.equal(seen.voters, 3);
  assert.equal(seen.totals, null);
  assert.equal('votes' in seen, false);

  const closed = await owner('POST', `/api/proposals/${proposal.id}/close`);
  assert.deepEqual(closed.data.proposal.totals, ['2', '1', '0']);
  assert.equal((await vote(ben, wallets.ben, proposal.id, 0)).status, 400);
});

test('NOX-weighted votes count tokens once, even if they move mid-vote', async () => {
  const unit = 10n ** 18n;
  chain.setBalance(wallets.ana.address, 100n * unit);
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Fund the grants round', options: ['Fund', 'Wait'], weighting: 'nox' })).data;

  const empty = await vote(ben, wallets.ben, proposal.id, 1);
  assert.equal(empty.status, 403);
  assert.match(empty.data.error, /hold none/);

  assert.equal((await vote(ana, wallets.ana, proposal.id, 0)).data.proposal.myVote.weight, (100n * unit).toString());
  // Ana hands her tokens to Ben, who votes the other way with the same 100 NOX
  chain.setBalance(wallets.ana.address, 0n);
  chain.setBalance(wallets.ben.address, 100n * unit);
  await vote(ben, wallets.ben, proposal.id, 1);

  const closed = (await owner('POST', `/api/proposals/${proposal.id}/close`)).data.proposal;
  assert.deepEqual(closed.totals, ['0', (100n * unit).toString()]);

  const audit = (await owner('GET', `/api/proposals/${proposal.id}/audit`)).data;
  assert.equal(audit.ballots.length, 2);
  for (const b of audit.ballots) assert.equal(siwe.recover(b.message, b.signature), b.address);
  assert.equal(audit.ballots.find((b) => b.address === wallets.ana.address.toLowerCase()).weightCounted, '0');
  assert.equal((await ana('GET', `/api/proposals/${proposal.id}/audit`)).status, 403);
});

test('a closed result survives a voter being erased', async () => {
  const before = (await owner('GET', '/api/proposals')).data.find((p) => p.title === 'Adopt the Q1 roadmap');
  const benId = (await ben('GET', '/api/bootstrap')).data.me.id;
  await owner('PATCH', `/api/users/${benId}`, { deactivated: true });
  await owner('DELETE', `/api/users/${benId}`);
  const after = (await owner('GET', '/api/proposals')).data.find((p) => p.id === before.id);
  assert.deepEqual(after.totals, before.totals);
});
