import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import smartWallet from './helpers/smartWallet.js';
import siwe from '../auth/siwe.js';

let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const ownerWallet = wallet();
const people = {};

before(async () => {
  srv = await startServer({ chain, env: { SIGNIN_CHAIN_TIMEOUT_SECONDS: '1' } });
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  // Ana's smart wallet is deployed; Ben's exists only as an address so far (EIP-6492)
  for (const [name, w] of [['ana', smartWallet()], ['ben', smartWallet({ deployed: false })]]) {
    chain.addSmartWallet(w);
    const c = client(base);
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    assert.equal((await c.wallet(w, 'invite', { name, inviteToken: inv.data.token })).status, 200);
    people[name] = { c, w };
  }
});
after(() => srv.close());

async function vote(c, id, choice, sign, address) {
  const ballot = await c('POST', `/api/proposals/${id}/ballot`, { choice });
  return c('POST', `/api/proposals/${id}/vote`, { ballotId: ballot.data.ballotId, signature: sign(ballot.data.message), ...(address ? { address } : {}) });
}

test('smart wallets cast signed votes, checked on-chain, and the audit file says how each ballot was checked', async () => {
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Move the offsite', options: ['Yes', 'No'] })).data;
  const { ana, ben } = people;

  // without saying which wallet signed, a smart wallet's signature can't be matched to anyone
  assert.equal((await vote(ana.c, proposal.id, 0, ana.w.sign)).status, 401);
  // a signature from a key that doesn't own the wallet
  assert.equal((await vote(ana.c, proposal.id, 0, ana.w.forge, ana.w.address)).status, 401);
  // Ana's wallet named on Ben's ballot: it isn't linked to Ben
  assert.equal((await vote(ben.c, proposal.id, 0, ana.w.sign, ana.w.address)).status, 401);

  const head = chain.head();
  assert.equal((await vote(ana.c, proposal.id, 0, ana.w.sign, ana.w.address)).status, 200);
  assert.equal((await vote(ben.c, proposal.id, 1, ben.w.sign, ben.w.address)).status, 200);
  assert.equal((await vote(owner, proposal.id, 0, ownerWallet.sign, ownerWallet.address)).status, 200);

  await owner('POST', `/api/proposals/${proposal.id}/close`);
  const audit = (await owner('GET', `/api/proposals/${proposal.id}/audit`)).data;
  assert.equal(audit.chainId, 1);
  const byAddress = Object.fromEntries(audit.ballots.map((b) => [b.address, b]));
  assert.deepEqual([byAddress[ana.w.address].signatureCheck, byAddress[ana.w.address].checkedAtBlock], ['eip1271', head]);
  assert.deepEqual([byAddress[ben.w.address].signatureCheck, byAddress[ben.w.address].checkedAtBlock], ['eip6492', head]);
  const plain = byAddress[ownerWallet.address.toLowerCase()];
  assert.equal(plain.signatureCheck, 'ecrecover');
  assert.equal('checkedAtBlock' in plain, false);
  // plain ballots still recount from the file alone
  assert.equal(siwe.recover(plain.message, plain.signature), plain.address);
  assert.deepEqual(audit.proposal.result.totals, ['2', '1']);
});

test('a smart-wallet ballot the chain can’t check right now is a node problem, not a wrong signature', async () => {
  const { proposal } = (await owner('POST', '/api/proposals', { title: 'Node down', options: ['Yes', 'No'] })).data;
  const lift = chain.refuse((method) => method === 'eth_call', { status: 503, error: { code: -32603, message: 'Service unavailable' } });
  try {
    const res = await vote(people.ana.c, proposal.id, 0, people.ana.w.sign, people.ana.w.address);
    assert.equal(res.status, 503);
  } finally {
    lift();
  }
  assert.equal((await vote(people.ana.c, proposal.id, 0, people.ana.w.sign, people.ana.w.address)).status, 200);
});
