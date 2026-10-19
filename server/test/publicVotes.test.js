import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import smartWallet from './helpers/smartWallet.js';

let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const wallets = { owner: wallet(), ana: wallet(), anaSpare: wallet() };
const NOX = 10n ** 18n;
const ids = {};

before(async () => {
  srv = await startServer({ chain, env: { TRUST_PROXY: 'loopback' } });
  await owner.wallet(wallets.owner, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await ana.wallet(wallets.ana, 'invite', { name: 'Ana Ortiz', inviteToken: inv.data.token });
  ids.ana = (await ana('GET', '/api/bootstrap')).data.me.id;
  chain.setBalance(wallets.owner.address, 1000n * NOX);
  chain.setBalance(wallets.ana.address, 250n * NOX);
  chain.mine(20);
});
after(() => srv.close());

// someone from outside, on their own network, with no cookie of any kind
const visitor = (n) => client(base, { headers: { 'X-Forwarded-For': `10.77.${n}.1` } });

async function startPublic(extra = {}) {
  const res = await owner('POST', '/api/proposals', { title: 'Fund the grants round', options: ['Yes', 'No'], weighting: 'power', publicVote: true, ...extra });
  assert.equal(res.status, 200, res.data.error);
  return res.data.proposal;
}

async function castAs(c, slug, w, choice, sign = (m) => w.sign(m)) {
  const challenge = await c('POST', `/api/public/votes/${slug}/challenge`, { address: w.address, choice });
  if (challenge.status !== 200) return challenge;
  return c('POST', `/api/public/votes/${slug}/ballot`, { challengeId: challenge.data.challengeId, signature: sign(challenge.data.message) });
}

test('only a signed vote weighted by voting power can be public', async () => {
  assert.equal((await owner('POST', '/api/proposals', { title: 'Equal', publicVote: true })).status, 400);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Secret', weighting: 'power', anonymous: true, publicVote: true })).status, 400);
  const proposal = await startPublic();
  assert.match(proposal.publicVote.slug, /^[\w-]{22}$/);
  assert.equal(proposal.publicBallots, true);
});

test('anyone can open the page, with no session, no cookie and nothing about the workspace beyond the vote', async () => {
  const proposal = await startPublic({ body: 'Details for everyone.' });
  const guest = visitor(1);
  const view = await guest('GET', `/api/public/votes/${proposal.publicVote.slug}`);
  assert.equal(view.status, 200);
  assert.equal(view.headers.get('set-cookie'), null);
  assert.equal(guest.cookie(), '');
  assert.equal(view.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.deepEqual(view.data.options, ['Yes', 'No']);
  assert.equal(view.data.body, 'Details for everyone.');
  assert.equal(view.data.snapshot.block, chain.head() - 2);
  assert.equal(view.data.snapshot.token.symbol.length > 0, true);
  // the in-app ballot of a member shows up by wallet only
  const ballot = await ana('POST', `/api/proposals/${proposal.id}/ballot`, { choice: 0 });
  await ana('POST', `/api/proposals/${proposal.id}/vote`, { ballotId: ballot.data.ballotId, signature: wallets.ana.sign(ballot.data.message) });
  const after = JSON.stringify((await guest('GET', `/api/public/votes/${proposal.publicVote.slug}`)).data);
  assert.ok(after.includes(wallets.ana.address));
  for (const secret of [ids.ana, 'Ana Ortiz', 'Erik Lind', proposal.id]) assert.equal(after.includes(secret), false, secret);
  // guessing is no use
  assert.equal((await guest('GET', '/api/public/votes/AAAAAAAAAAAAAAAAAAAAAA')).status, 404);
  assert.equal((await guest('GET', `/api/public/votes/${proposal.id}`)).status, 404);
});

test('an outside wallet votes with the power it held at the snapshot block, once, and can change its mind', async () => {
  const proposal = await startPublic();
  const slug = proposal.publicVote.slug;
  const holder = wallet();
  chain.setBalance(holder.address, 40n * NOX);
  chain.setStake(holder.address, 2n * NOX);
  const from = chain.calls.length;
  const guest = visitor(2);
  const cast = await castAs(guest, slug, holder, 1);
  assert.equal(cast.status, 200, cast.data.error);
  assert.equal(cast.data.counted.weight, String(42n * NOX));
  assert.equal(guest.cookie(), '');
  // every read for this wallet named the vote's snapshot block
  const reads = chain.calls.slice(from).filter((c) => c.method === 'eth_call' && c.params[0].data?.endsWith(holder.address.slice(2).toLowerCase()));
  assert.ok(reads.length >= 2);
  assert.ok(reads.every((c) => c.params[1] === `0x${cast.data.vote.snapshot.block.toString(16)}`));

  assert.deepEqual(cast.data.vote.totals, ['0', String(42n * NOX)]);
  assert.equal((await castAs(guest, slug, holder, 0)).status, 200);
  const view = (await guest('GET', `/api/public/votes/${slug}`)).data;
  assert.equal(view.voters, 1);
  assert.deepEqual(view.totals, [String(42n * NOX), '0']);
  assert.deepEqual(view.ballots.map((b) => [b.address, b.choice, b.weight]), [[holder.address.toLowerCase(), 0, String(42n * NOX)]]);

  // members see it in the app too, as a wallet with no member behind it
  const inApp = (await ana('GET', '/api/proposals')).data.find((p) => p.id === proposal.id);
  assert.deepEqual(inApp.ballots.map((b) => [b.userId, b.address]), [[null, holder.address.toLowerCase()]]);

  const audit = await visitor(3)('GET', `/api/public/votes/${slug}/audit`);
  assert.equal(audit.status, 200);
  assert.equal(audit.data.proposal.public, true);
  assert.deepEqual(audit.data.outsideBallots.map((b) => [b.address, b.choice, b.signatureCheck, b.snapshot.staked]), [[holder.address.toLowerCase(), 0, 'ecrecover', String(2n * NOX)]]);
});

test('a wallet with no power, a wrong signature or a reused challenge counts for nothing', async () => {
  const proposal = await startPublic();
  const slug = proposal.publicVote.slug;
  const guest = visitor(4);
  const empty = wallet();
  const refused = await castAs(guest, slug, empty, 0);
  assert.equal(refused.status, 403);
  assert.match(refused.data.error, /no voting power/);

  const holder = wallet();
  chain.setBalance(holder.address, 5n * NOX);
  assert.equal((await castAs(guest, slug, holder, 0, (m) => wallet().sign(m))).status, 401);

  const challenge = await guest('POST', `/api/public/votes/${slug}/challenge`, { address: holder.address, choice: 0 });
  const signature = holder.sign(challenge.data.message);
  // a challenge only works from the network that asked for it, and only once
  assert.equal((await visitor(5)('POST', `/api/public/votes/${slug}/ballot`, { challengeId: challenge.data.challengeId, signature })).status, 400);
  assert.equal((await guest('POST', `/api/public/votes/${slug}/ballot`, { challengeId: challenge.data.challengeId, signature })).status, 200);
  assert.equal((await guest('POST', `/api/public/votes/${slug}/ballot`, { challengeId: challenge.data.challengeId, signature })).status, 400);
  // nor on another vote
  const other = await startPublic();
  const again = await guest('POST', `/api/public/votes/${slug}/challenge`, { address: holder.address, choice: 1 });
  assert.equal((await guest('POST', `/api/public/votes/${other.publicVote.slug}/ballot`, { challengeId: again.data.challengeId, signature: holder.sign(again.data.message) })).status, 400);
});

test('a smart wallet votes too, checked on-chain at a block the audit file notes', async () => {
  const proposal = await startPublic();
  const safe = smartWallet();
  chain.addSmartWallet(safe);
  chain.setBalance(safe.address, 7n * NOX);
  const cast = await castAs(visitor(6), proposal.publicVote.slug, safe, 1);
  assert.equal(cast.status, 200, cast.data.error);
  const audit = (await visitor(6)('GET', `/api/public/votes/${proposal.publicVote.slug}/audit`)).data;
  assert.equal(audit.outsideBallots[0].signatureCheck, 'eip1271');
  assert.equal(typeof audit.outsideBallots[0].checkedAtBlock, 'number');
});

test('a member voting on the page is still one ballot, with all their power', async () => {
  // linked before the vote opens, so the snapshot counts it with Ana's other wallet
  assert.equal((await ana.wallet(wallets.ana, 'confirm')).status, 200);
  assert.equal((await ana.wallet(wallets.anaSpare, 'add')).status, 200);
  chain.setBalance(wallets.anaSpare.address, 50n * NOX);
  const proposal = await startPublic();
  const slug = proposal.publicVote.slug;
  const ballot = await ana('POST', `/api/proposals/${proposal.id}/ballot`, { choice: 0 });
  await ana('POST', `/api/proposals/${proposal.id}/vote`, { ballotId: ballot.data.ballotId, signature: wallets.ana.sign(ballot.data.message) });
  const inApp = (await ana('GET', '/api/proposals')).data.find((p) => p.id === proposal.id).myVote.weight;
  // both of Ana's wallets, counted together
  assert.equal(inApp, String(300n * NOX));

  // her other wallet signs on the page, and replaces her ballot instead of adding one
  const cast = await castAs(visitor(7), slug, wallets.anaSpare, 1);
  assert.equal(cast.status, 200, cast.data.error);
  assert.equal(cast.data.counted.weight, inApp);
  const view = (await visitor(7)('GET', `/api/public/votes/${slug}`)).data;
  assert.equal(view.voters, 1);
  assert.deepEqual(view.totals, ['0', inApp]);
  const mine = (await ana('GET', '/api/proposals')).data.find((p) => p.id === proposal.id);
  assert.deepEqual(mine.myVote, { choice: 1, weight: inApp });
});

test('a sealed public vote shows totals and ballots only once it closes, and a closed one takes no ballots', async () => {
  const proposal = await startPublic({ sealed: true });
  const slug = proposal.publicVote.slug;
  const holder = wallet();
  chain.setBalance(holder.address, 3n * NOX);
  const guest = visitor(8);
  assert.equal((await castAs(guest, slug, holder, 0)).status, 200);
  const open = (await guest('GET', `/api/public/votes/${slug}`)).data;
  assert.equal(open.totals, null);
  assert.equal(open.ballots, null);
  assert.equal(open.voters, 1);
  assert.equal((await guest('GET', `/api/public/votes/${slug}/audit`)).status, 409);

  await owner('POST', `/api/proposals/${proposal.id}/close`);
  const closed = (await guest('GET', `/api/public/votes/${slug}`)).data;
  assert.equal(closed.open, false);
  assert.deepEqual(closed.totals, [String(3n * NOX), '0']);
  assert.equal(closed.ballots.length, 1);
  assert.equal((await guest('GET', `/api/public/votes/${slug}/audit`)).status, 200);
  const late = await guest('POST', `/api/public/votes/${slug}/challenge`, { address: holder.address, choice: 1 });
  assert.equal(late.status, 400);
  assert.match(late.data.error, /closed/);

  // deleting the vote takes its page down
  await owner('DELETE', `/api/proposals/${proposal.id}`);
  assert.equal((await guest('GET', `/api/public/votes/${slug}`)).status, 404);
});

test('ballots are capped in size and rate limited by network', async () => {
  const proposal = await startPublic();
  const slug = proposal.publicVote.slug;
  const guest = visitor(9);
  const big = await guest('POST', `/api/public/votes/${slug}/ballot`, { challengeId: 'x', signature: `0x${'ab'.repeat(30_000)}` });
  assert.equal(big.status, 413);
  const statuses = [];
  for (let i = 0; i < 31; i++) statuses.push((await guest('POST', `/api/public/votes/${slug}/challenge`, { address: wallet().address, choice: 0 })).status);
  assert.equal(statuses.filter((s) => s === 200).length, 30);
  assert.equal(statuses.at(-1), 429);
  // another network still gets through
  assert.equal((await visitor(10)('POST', `/api/public/votes/${slug}/challenge`, { address: wallet().address, choice: 0 })).status, 200);
});
