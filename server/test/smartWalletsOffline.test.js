import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import smartWallet from './helpers/smartWallet.js';

// With NOX_RPC_URL=off there's no chain to ask, so only plain wallets can sign in.
let srv;
const base = () => srv.base;
const owner = client(base);

before(async () => {
  srv = await startServer();
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('without a chain, a smart wallet is told plainly why it can’t sign in', async () => {
  const token = (await owner('POST', '/api/invites', { role: 'member' })).data.token;
  const res = await client(base).wallet(smartWallet(), 'invite', { name: 'Ana', inviteToken: token });
  assert.equal(res.status, 401);
  assert.match(res.data.error, /smart wallet.*isn’t connected to Ethereum/);
  const plain = await client(base).wallet(wallet(), 'invite', { name: 'Ana', inviteToken: token });
  assert.equal(plain.status, 200);
});
