import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import rawPost from './helpers/rawPost.js';

// Wallet sign-in messages name the domain the wallet checks against the address bar. It must
// come from configuration, or a phishing site could relay a challenge for its own domain.
let srv;
const base = () => srv.base;
const owner = client(base);
const ownerWallet = wallet();

before(async () => {
  srv = await startServer();
  await owner.wallet(ownerWallet, 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
});
after(() => srv.close());

test('a phishing site can’t get a sign-in message for its own domain', async () => {
  const challenge = { address: ownerWallet.address, mode: 'login' };
  const phished = await rawPost(base(), '/api/auth/wallet/challenge', challenge, { Host: 'evil.example', Origin: 'https://evil.example' });
  assert.equal(phished.status, 403);

  // without an Origin the request goes through, but the message names this server, never the headers
  const relayed = await rawPost(base(), '/api/auth/wallet/challenge', challenge, { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https' });
  assert.equal(relayed.status, 200);
  const lines = relayed.data.message.split('\n');
  assert.equal(lines[0], `${new URL(base()).host} wants you to sign in with your Ethereum account:`);
  assert.ok(lines.includes(`URI: ${base()}`));
  assert.ok(!relayed.data.message.includes('evil.example'));

  // the origin check doesn't trust Host either: a site pointing its name here is still refused
  const sameHost = await rawPost(base(), '/api/auth/wallet/challenge', challenge, { Host: 'evil.example', Origin: 'http://evil.example' });
  assert.equal(sameHost.status, 403);
  const socket = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers: { Cookie: owner.cookie(), Origin: 'http://evil.example', Host: 'evil.example' } });
  const [err] = await once(socket, 'error');
  assert.match(err.message, /403/);
});
