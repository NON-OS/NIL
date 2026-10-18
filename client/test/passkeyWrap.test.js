import { test } from 'node:test';
import assert from 'node:assert/strict';
import passkeyWrap from '../src/lib/crypto/passkeyWrap.ts';
import b64u from '../src/lib/crypto/b64u.ts';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
// a fixed stand-in for the 32 bytes a passkey's PRF gives for one salt
const prf = () => Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 1);
const seed = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
const context = { userId: 'u1', workspaceKey: 'ws-key', credentialId: 'cred-one' };

test('the passkey’s PRF output opens its wrap of the seed', async () => {
  const wrapped = await passkeyWrap.seal(seed, prf(), context);
  assert.equal(b64u.decode(wrapped).length, 60, 'IV, seed and tag: the size the server expects');
  assert.equal(wrapped.includes(b64u.encode(seed)), false);
  assert.equal(hex(await passkeyWrap.open(wrapped, prf(), { ...context })), hex(seed));
  // a fresh IV every time, so two wraps of the same seed look unrelated
  assert.notEqual(await passkeyWrap.seal(seed, prf(), context), wrapped);
});

test('a wrong output, another passkey, account or workspace, or a changed byte opens nothing', async () => {
  const wrapped = await passkeyWrap.seal(seed, prf(), context);
  const wrong = prf();
  wrong[31] ^= 1;
  await assert.rejects(passkeyWrap.open(wrapped, wrong, context));
  await assert.rejects(passkeyWrap.open(wrapped, prf(), { ...context, credentialId: 'cred-two' }));
  await assert.rejects(passkeyWrap.open(wrapped, prf(), { ...context, userId: 'u2' }));
  await assert.rejects(passkeyWrap.open(wrapped, prf(), { ...context, workspaceKey: 'other-ws-key' }));
  const bytes = b64u.decode(wrapped);
  for (const at of [0, 12, 40, bytes.length - 1]) {
    const tampered = Uint8Array.from(bytes);
    tampered[at] ^= 0x80;
    await assert.rejects(passkeyWrap.open(b64u.encode(tampered), prf(), context), `byte ${at}`);
  }
  await assert.rejects(passkeyWrap.open(b64u.encode(bytes.subarray(0, 59)), prf(), context));
});

test('an output that isn’t 32 bytes is refused before it’s used', async () => {
  await assert.rejects(passkeyWrap.seal(seed, new Uint8Array(16), context), /can’t use/);
  await assert.rejects(passkeyWrap.open('AAAA', new Uint8Array(0), context), /can’t use/);
});

test('the wrapping key comes from HKDF-SHA256 with its own label, so it is not the raw output', async () => {
  const { hkdf } = await import('@noble/hashes/hkdf');
  const { sha256 } = await import('@noble/hashes/sha256');
  const key = hkdf(sha256, prf(), undefined, new TextEncoder().encode('nil/passkey-wrap/v1'), 32);
  const blob = b64u.decode(await passkeyWrap.seal(seed, prf(), context));
  const aad = new TextEncoder().encode('nil/passkey-wrap/v1|u1|ws-key|cred-one');
  const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12), additionalData: aad }, await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']), blob.subarray(12));
  assert.equal(hex(new Uint8Array(opened)), hex(seed));
  const raw = await crypto.subtle.importKey('raw', prf(), 'AES-GCM', false, ['decrypt']);
  await assert.rejects(crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12), additionalData: aad }, raw, blob.subarray(12)));
});
