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

test('weighted votes count NOX held, NOX staked and ZSPs, snapshotted when the vote opens', async () => {
  const unit = 10n ** 18n;
  const ZSP = '0x7b575dd8e8b111c52ab1e872924d4efd4df403df';
  assert.equal((await ana('PUT', '/api/vote-power', { zspPower: '500' })).status, 403);
  assert.equal((await owner('PUT', '/api/vote-power', { zspPower: '1.5' })).status, 400);
  assert.equal((await owner('PUT', '/api/vote-power', { zspPower: '500' })).data.zspPower, '500');
  chain.setBalance(wallets.ana.address, 100n * unit);
  chain.setStake(wallets.ana.address, 50n * unit);
  chain.setTokenBalance(ZSP, wallets.ana.address, 2);
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Fund the grants round', options: ['Fund', 'Wait'], weighting: 'power' })).data;

  const empty = await vote(ben, wallets.ben, proposal.id, 1);
  assert.equal(empty.status, 403);
  assert.match(empty.data.error, /you had none then/);

  // 100 held + 50 staked + 2 ZSPs × 500
  const anaPower = (1150n * unit).toString();
  assert.equal((await vote(ana, wallets.ana, proposal.id, 0)).data.proposal.myVote.weight, anaPower);
  // Ana hands her tokens to Ben after the snapshot: Ben still has no power in this vote
  chain.setBalance(wallets.ana.address, 0n);
  chain.setBalance(wallets.ben.address, 100n * unit);
  assert.equal((await vote(ben, wallets.ben, proposal.id, 1)).status, 403);

  const closed = (await owner('POST', `/api/proposals/${proposal.id}/close`)).data.proposal;
  assert.deepEqual(closed.totals, [anaPower, '0']);

  const audit = (await owner('GET', `/api/proposals/${proposal.id}/audit`)).data;
  assert.equal(audit.power.zspPower, '500');
  assert.ok(audit.power.block > 0);
  const snap = audit.power.members.find((m) => m.wallets.includes(wallets.ana.address.toLowerCase()));
  assert.deepEqual([snap.nox, snap.staked, snap.zsp, snap.power], [(100n * unit).toString(), (50n * unit).toString(), 2, anaPower]);
  for (const b of audit.ballots) assert.equal(siwe.recover(b.message, b.signature), b.address);
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
