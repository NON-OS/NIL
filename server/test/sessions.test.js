import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import rawPost from './helpers/rawPost.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const ownerWallet = wallet();
const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  srv = await startServer();
  await owner.wallet(ownerWallet, 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
});
after(() => srv.close());

test('signing out closes the live connection that session opened, and only that one', async () => {
  const other = client(base);
  await other.wallet(ownerWallet, 'login');
  const open = (cookie) => {
    const ws = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers: { Cookie: cookie } });
    const seen = { events: [], closed: null, ws };
    ws.on('message', (m) => seen.events.push(JSON.parse(String(m))));
    ws.on('close', (code) => (seen.closed = code));
    return once(ws, 'open').then(() => seen);
  };
  const signedOut = await open(owner.cookie());
  const stillIn = await open(other.cookie());
  const cookie = owner.cookie();

  assert.equal((await owner('POST', '/api/auth/logout')).status, 200);
  await settle();
  assert.equal(signedOut.closed, 4001);
  assert.equal(stillIn.closed, null);
  assert.equal((await fetch(`${base()}/api/bootstrap`, { headers: { Cookie: cookie } })).status, 401);

  const before = signedOut.events.length;
  await other('POST', '/api/tasks', { title: 'Written after the sign-out' });
  await settle();
  assert.equal(signedOut.events.length, before);
  assert.ok(stillIn.events.some((e) => e.task?.title === 'Written after the sign-out'));
  stillIn.ws.close();
  await owner.wallet(ownerWallet, 'login');
});

test('over HTTPS only the __Host- cookie counts, so a planted plain cookie signs nobody in', async () => {
  const https = { 'X-Forwarded-Proto': 'https' };
  const challenge = await rawPost(base(), '/api/auth/wallet/challenge', { address: ownerWallet.address, mode: 'login' }, https);
  const res = await fetch(`${base()}/api/auth/wallet/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-NONOS': '1', ...https },
    body: JSON.stringify({ challengeId: challenge.data.challengeId, signature: ownerWallet.sign(challenge.data.message) }),
  });
  const set = res.headers.get('set-cookie');
  assert.match(set, /^__Host-nonos=[^;]+; Path=\/; HttpOnly; Secure/);
  const token = set.split(';')[0].split('=')[1];
  const as = (cookie, headers = {}) => fetch(`${base()}/api/bootstrap`, { headers: { Cookie: cookie, ...headers } }).then((r) => r.status);

  assert.equal(await as(`__Host-nonos=${token}`, https), 200);
  assert.equal(await as(`nonos=${token}`, https), 401);
  // a subdomain's cookie arrives next to the real one, and must not win either way round
  assert.equal(await as(`nonos=planted; __Host-nonos=${token}`, https), 200);
  assert.equal(await as(`nonos=${token}`), 200);
  assert.equal(await as(`__Host-nonos=${token}`), 401);
});
