import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import keyStatement from '../../client/src/lib/crypto/keyStatement.ts';
import unlockMessage from '../../client/src/lib/crypto/unlockMessage.ts';
import identityFromSeed from '../../client/src/lib/crypto/identityFromSeed.ts';
import b64u from '../../client/src/lib/crypto/b64u.ts';

let srv;
const owner = client(() => srv.base);
const ownerWallet = wallet();
let userId;

before(async () => {
  srv = await startServer();
  userId = (await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' })).data.user.id;
});
after(() => srv.close());

// What the browser signs, built the way it builds it: from the bootstrap's origin and workspace key.
async function messages() {
  const { origin, workspaceKey } = (await owner('GET', '/api/bootstrap')).data;
  return {
    unlock: unlockMessage({ origin, workspaceKey, userId, address: ownerWallet.address, nonce: 'a1b2c3d4e5f6a7b8', issuedAt: '2026-10-16T09:00:00.000Z' }),
    statement: keyStatement({ origin, workspaceKey, userId, address: ownerWallet.address, publicKey: 'A'.repeat(43), signingKey: 'B'.repeat(43), createdAt: 1_790_000_000_000 }),
  };
}

test('renaming the workspace leaves every key message unchanged', async () => {
  const first = await messages();
  assert.equal((await owner('PATCH', '/api/workspace', { name: 'Renamed Collective' })).status, 200);
  assert.deepEqual(await messages(), first);
  for (const message of Object.values(first)) assert.ok(!message.includes('NØNOS') && !message.includes('Renamed Collective'));
});

test('a key statement written by the browser module is accepted by the server', async () => {
  const { origin, workspaceKey } = (await owner('GET', '/api/bootstrap')).data;
  const identity = identityFromSeed(crypto.getRandomValues(new Uint8Array(32)));
  const fields = { publicKey: b64u.encode(identity.publicKey), signingKey: b64u.encode(identity.signingKey), createdAt: Date.now(), address: ownerWallet.address };
  const signature = ownerWallet.sign(keyStatement({ origin, workspaceKey, userId, ...fields }));
  const wrap = { address: ownerWallet.address, nonce: 'a1b2c3d4e5f6a7b8', issuedAt: new Date().toISOString(), wrapped: crypto.randomBytes(60).toString('base64url') };
  const res = await owner('PUT', '/api/me/encryption-key', { ...fields, signature, wrap });
  assert.equal(res.status, 200);
  assert.equal(res.data.publicKey, fields.publicKey);
});
