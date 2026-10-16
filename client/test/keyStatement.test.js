import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import wallet from '../../server/test/helpers/wallet.js';
import serverStatement from '../../server/keys/keyStatement.js';
import keyStatement from '../src/lib/crypto/keyStatement.ts';
import unlockMessage from '../src/lib/crypto/unlockMessage.ts';
import verifyKeyStatement from '../src/lib/crypto/verifyKeyStatement.ts';
import recoverAddress from '../src/lib/crypto/recoverAddress.ts';
import assertNotKeyMessage from '../src/lib/crypto/assertNotKeyMessage.ts';

const blob = (n) => crypto.randomBytes(n).toString('base64url');
const site = { origin: 'https://nil.example', workspaceKey: blob(32) };

function published(w, overrides = {}) {
  const entry = { userId: 'person-one', publicKey: blob(32), signingKey: blob(32), createdAt: Date.now(), address: w.address, active: true, ...overrides };
  return { ...entry, signature: w.sign(keyStatement({ ...site, ...entry })) };
}

test('the browser and the server write the same key statement, byte for byte', () => {
  const w = wallet();
  const fields = { address: w.address, workspaceKey: site.workspaceKey, userId: 'person-one', publicKey: blob(32), signingKey: blob(32), createdAt: Date.now() };
  const url = new URL(site.origin);
  assert.equal(keyStatement({ ...fields, origin: site.origin }), serverStatement({ ...fields, host: url.host, origin: url.origin }));
});

test('key messages are plain ASCII in EIP-4361 shape, naming the site, the wallet and the account', () => {
  const w = wallet();
  const statement = keyStatement({ ...site, address: w.address, userId: 'person-one', publicKey: blob(32), signingKey: blob(32), createdAt: Date.now() });
  const unlock = unlockMessage({ ...site, address: w.address, userId: 'person-one', nonce: 'a1b2c3d4e5f6a7b8', issuedAt: new Date().toISOString() });
  for (const message of [statement, unlock]) {
    assert.match(message, /^[\x20-\x7e\n]+$/);
    assert.match(message, /^nil\.example wants you to sign in with your Ethereum account:\n0x[0-9a-fA-F]{40}\n\n/);
    assert.match(message, /^URI: https:\/\/nil\.example$/m);
    assert.match(message, /^Chain ID: 1$/m);
    assert.match(message, /^Nonce: [A-Za-z0-9]{8,}$/m);
    assert.match(message, new RegExp(`^- urn:nil:workspace:${site.workspaceKey}$`, 'm'));
    assert.match(message, /^- urn:nil:account:person-one$/m);
    assert.match(message, /not a transaction and costs nothing/);
    assert.ok(message.toLowerCase().includes(w.address));
  }
  assert.notEqual(unlockMessage({ ...site, address: wallet().address, userId: 'person-one', nonce: 'a1b2c3d4e5f6a7b8', issuedAt: '2026-01-01T00:00:00.000Z' }), unlock);
  assert.notEqual(unlockMessage({ ...site, origin: 'https://evil.example', address: w.address, userId: 'person-one', nonce: 'a1b2c3d4e5f6a7b8', issuedAt: '2026-01-01T00:00:00.000Z' }), unlock);
});

test('browsers accept a key only with its own wallet’s signature over this site and workspace', () => {
  const w = wallet();
  const genuine = published(w);
  assert.equal(verifyKeyStatement(genuine, site), true);
  assert.equal(recoverAddress(keyStatement({ ...site, ...genuine }), genuine.signature), w.address);
  // the server swaps in its own key, moves the statement to another person, or names another wallet
  assert.equal(verifyKeyStatement({ ...genuine, publicKey: blob(32) }, site), false);
  assert.equal(verifyKeyStatement({ ...genuine, signingKey: blob(32) }, site), false);
  assert.equal(verifyKeyStatement({ ...genuine, userId: 'person-two' }, site), false);
  assert.equal(verifyKeyStatement({ ...genuine, address: wallet().address }, site), false);
  assert.equal(verifyKeyStatement({ ...genuine, createdAt: genuine.createdAt + 1 }, site), false);
  // a statement signed for a phishing site or another workspace doesn't carry over
  assert.equal(verifyKeyStatement(genuine, { ...site, origin: 'https://nil-example.com' }), false);
  assert.equal(verifyKeyStatement(genuine, { ...site, workspaceKey: blob(32) }), false);
  // and an operator's own wallet can't sign for someone else's account without it showing
  const operator = wallet();
  const forged = { ...genuine, address: w.address, signature: operator.sign(keyStatement({ ...site, ...genuine })) };
  assert.equal(verifyKeyStatement(forged, site), false);
  assert.equal(verifyKeyStatement({ ...genuine, signature: '0x1234' }, site), false);
});

test('server-written messages that look like key messages are never signed', () => {
  assert.doesNotThrow(() => assertNotKeyMessage('nil.example wants you to sign in with your Ethereum account:\n0xabc\n\nSign in to Nil.'));
  const w = wallet();
  assert.throws(() => assertNotKeyMessage(unlockMessage({ ...site, address: w.address, userId: 'u', nonce: 'a1b2c3d4e5f6a7b8', issuedAt: new Date().toISOString() })), /didn’t sign it/);
  assert.throws(() => assertNotKeyMessage(keyStatement({ ...site, address: w.address, userId: 'u', publicKey: blob(32), signingKey: blob(32), createdAt: Date.now() })), /didn’t sign it/);
});
