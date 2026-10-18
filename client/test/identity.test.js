import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import wallet from '../../server/test/helpers/wallet.js';
import identityFromSeed from '../src/lib/crypto/identityFromSeed.ts';
import privateKeysFromSeed from '../src/lib/crypto/privateKeysFromSeed.ts';
import wrapIdentity from '../src/lib/crypto/wrapIdentity.ts';
import signatureSecret from '../src/lib/crypto/signatureSecret.ts';
import recoveryKit from '../src/lib/crypto/recoveryKit.ts';
import memberFingerprint from '../src/lib/crypto/memberFingerprint.ts';
import b64u from '../src/lib/crypto/b64u.ts';

const seed = () => crypto.getRandomValues(new Uint8Array(32));
const hex = (bytes) => Buffer.from(bytes).toString('hex');

test('an identity is a pure function of its seed, and its keys are independent', () => {
  const s = seed();
  const a = identityFromSeed(s);
  const b = identityFromSeed(Uint8Array.from(s));
  assert.equal(hex(a.publicKey), hex(b.publicKey));
  assert.equal(hex(a.signingKey), hex(b.signingKey));
  const keys = privateKeysFromSeed(s);
  const all = [a.privateKey, a.signingPrivate, keys.spendingKey, keys.viewingKey, keys.semaphoreSecret].map(hex);
  assert.equal(new Set(all).size, all.length);
  assert.notEqual(hex(identityFromSeed(seed()).publicKey), hex(a.publicKey));
});

test('any wallet with a wrap opens the same identity; another wallet or account opens nothing', async () => {
  const s = seed();
  const first = wallet();
  const second = wallet();
  const message = (w) => `unlock for ${w.address}`;
  const wraps = await Promise.all([first, second].map((w) => wrapIdentity.seal(s, w.sign(message(w)), { userId: 'u1', address: w.address })));
  for (const [i, w] of [first, second].entries()) {
    assert.equal(hex(await wrapIdentity.open(wraps[i], w.sign(message(w)), { userId: 'u1', address: w.address })), hex(s));
  }
  await assert.rejects(wrapIdentity.open(wraps[0], second.sign(message(first)), { userId: 'u1', address: first.address }));
  await assert.rejects(wrapIdentity.open(wraps[0], first.sign(message(first)), { userId: 'u2', address: first.address }));
  await assert.rejects(wrapIdentity.open(wraps[0], first.sign(message(first)), { userId: 'u1', address: second.address }));
});

test('the wallet secret ignores how the recovery byte is written and the sign of s', () => {
  const sig = wallet().sign('hello');
  const raw = hexToBytes(sig.slice(2));
  const parsed = secp256k1.Signature.fromCompact(raw.slice(0, 64));
  const highS = new secp256k1.Signature(parsed.r, secp256k1.CURVE.n - parsed.s).toCompactRawBytes();
  const variants = [sig, `0x${bytesToHex(raw.slice(0, 64))}${(raw[64] - 27).toString(16).padStart(2, '0')}`, `0x${bytesToHex(highS)}1c`];
  const secrets = variants.map((v) => hex(signatureSecret(v, 'label')));
  assert.equal(new Set(secrets).size, 1);
  assert.notEqual(hex(signatureSecret(sig, 'other label')), secrets[0]);
});

test('a recovery kit opens with its passphrase only, and refuses edits to its header', async () => {
  const s = seed();
  const meta = { origin: 'https://nil.example', workspaceKey: 'ws-key', userId: 'u1', fingerprint: '0000-1111-2222-3333-4444' };
  await assert.rejects(recoveryKit.make(s, meta, 'short'), /at least 12/);
  const kit = await recoveryKit.make(s, meta, 'correct horse battery staple');
  assert.equal(JSON.stringify(kit).includes(b64u.encode(s)), false);
  const { seed: back } = await recoveryKit.open(JSON.parse(JSON.stringify(kit)), 'correct horse battery staple');
  assert.equal(hex(back), hex(s));
  await assert.rejects(recoveryKit.open(kit, 'wrong horse battery staple'), /doesn’t open/);
  await assert.rejects(recoveryKit.open({ ...kit, userId: 'u2' }, 'correct horse battery staple'), /doesn’t open/);
  await assert.rejects(recoveryKit.open({ ...kit, kdf: { ...kit.kdf, N: 2 ** 10 } }, 'correct horse battery staple'), /isn’t a Nil recovery kit/);
  await assert.rejects(recoveryKit.open({ hello: 'world' }, 'correct horse battery staple'), /isn’t a Nil recovery kit/);
});

test('a recovery kit asking for too much memory or work is refused before scrypt runs', { timeout: 5000 }, async () => {
  const meta = { origin: 'https://nil.example', workspaceKey: 'ws-key', userId: 'u1', fingerprint: '0000-1111-2222-3333-4444' };
  const kit = await recoveryKit.make(seed(), meta, 'correct horse battery staple');
  // each of these would hold the tab for minutes or ask for more memory than it has
  for (const cost of [{ p: 2 ** 20 }, { p: 9 }, { r: 2 ** 20 }, { r: 33 }, { r: 16, p: 5 }, { N: 2 ** 20 }, { r: 8.5 }, { r: '8' }, { p: null }]) {
    await assert.rejects(recoveryKit.open({ ...kit, kdf: { ...kit.kdf, ...cost } }, 'correct horse battery staple'), /isn’t a Nil recovery kit/, JSON.stringify(cost));
  }
});

test('fingerprints cover both keys and read as five groups of four', () => {
  const a = identityFromSeed(seed());
  const b = identityFromSeed(seed());
  const fp = memberFingerprint(b64u.encode(a.publicKey), b64u.encode(a.signingKey));
  assert.match(fp, /^[0-9a-f]{4}(-[0-9a-f]{4}){4}$/);
  assert.notEqual(memberFingerprint(b64u.encode(a.publicKey), b64u.encode(b.signingKey)), fp);
  assert.notEqual(memberFingerprint(b64u.encode(b.publicKey), b64u.encode(a.signingKey)), fp);
});
