import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';

// Keys someone replaced stay listed, with the wallet signature they were published with, so what
// they signed before still checks out for teammates who never saw the old key.
let srv;
const base = () => srv.base;
const owner = client(base);
const ann = client(base);
let w;

before(async () => {
  srv = await startServer();
  await owner.wallet(wallet(), 'setup', { name: 'Olivia', workspaceName: 'Acme' });
  w = wallet();
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await ann.wallet(w, 'invite', { name: 'Ann', inviteToken: inv.data.token });
});
after(() => srv.close());

test('a replaced key is kept with its signature; signing the same key again keeps nothing', async () => {
  const first = await publishKey(ann, w, { createdAt: Date.now() - 1000 });
  assert.equal(first.status, 200);
  assert.equal((await publishKey(ann, w, { signingKey: first.sent.signingKey, publicKey: first.sent.publicKey, createdAt: Date.now() - 500 })).status, 200);
  assert.deepEqual((await owner('GET', '/api/encryption-keys/earlier')).data, []);
  const second = await publishKey(ann, w, { reset: true });
  assert.equal(second.status, 200);
  const earlier = (await owner('GET', '/api/encryption-keys/earlier')).data;
  assert.equal(earlier.length, 1);
  assert.equal(earlier[0].signingKey, first.sent.signingKey);
  assert.equal(typeof earlier[0].signature, 'string');
});
