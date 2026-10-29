import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519, x25519 } from '@noble/curves/ed25519';
import callMediaKey from '../src/lib/crypto/callMediaKey.ts';

// The SFU's keys: a dishonest server or SFU that swaps the sealed key, the identity or the
// recipient, signs with a key of its own, or replays an older key is refused.
const person = () => {
  const signing = ed25519.utils.randomPrivateKey();
  const priv = x25519.utils.randomPrivateKey();
  return { signing, signingKey: ed25519.getPublicKey(signing), privateKey: priv, publicKey: x25519.getPublicKey(priv) };
};
const ana = { id: 'ana-0000001', ...person() };
const ben = { id: 'ben-0000002', ...person() };
const eve = person();
const place = { callId: 'call-0000001', workspaceKey: 'ws', origin: 'https://nil.example.com' };
const facts = (over = {}) => ({ from: ana.id, to: ben.id, identity: 'ana-on-sfu-1', frames: 'A'.repeat(43), epoch: 3, at: Date.now(), ...over });
const asBen = (over = {}) => ({ place, from: ana.id, me: ben.id, last: 2, now: Date.now(), ...over });
const sealFor = (key: Uint8Array, over = {}, who = ana) => callMediaKey.seal(key, facts(over), { place, recipientPublic: ben.publicKey, signingPrivate: who.signing });

test('a key sealed and signed for Ben opens for Ben, and its facts come with it', async () => {
  const key = callMediaKey.newKey();
  const opened = await callMediaKey.open(await sealFor(key), asBen(), [ana.signingKey], ben);
  assert.equal(opened.ok, true);
  assert.deepEqual((opened as { key: Uint8Array }).key, key);
  assert.equal((opened as { facts: { identity: string } }).facts.identity, 'ana-on-sfu-1');
});

test('a swapped key, identity or recipient, a forged signature or an old epoch is refused', async () => {
  const key = callMediaKey.newKey();
  const message = await sealFor(key);
  const reason = async (m: unknown, over = {}) => ((await callMediaKey.open(m, asBen(over), [ana.signingKey], ben)) as { reason?: string }).reason;
  // the server's own key sealed to Ben, under Ana's signature
  const other = await callMediaKey.seal(callMediaKey.newKey(), facts(), { place, recipientPublic: ben.publicKey, signingPrivate: ana.signing });
  assert.equal(await reason({ ...message, key: other.key }), 'tampered');
  // a statement edited to point Ana's key at another name on the SFU
  const edited = JSON.parse(message.link);
  edited.facts[2] = 'eve-on-sfu-1';
  assert.equal(await reason({ ...message, link: JSON.stringify(edited) }), 'forged');
  // signed by a key that isn't Ana's
  assert.equal(await reason(await sealFor(key, {}, { ...ana, signing: eve.signing })), 'forged');
  // for someone else, or for Ben from someone else
  assert.equal(await reason(await sealFor(key, { to: 'cy-0000003' })), 'wrong-people');
  assert.equal(await reason(message, { from: 'cy-0000003' }), 'wrong-people');
  // the same epoch again, or an older one: a replay
  assert.equal(await reason(message, { last: 3 }), 'stale');
  assert.equal(await reason(await sealFor(key, { at: Date.now() - 3_600_000 })), 'stale');
  // sealed to Eve, not to Ben
  const toEve = await callMediaKey.seal(key, facts(), { place, recipientPublic: eve.publicKey, signingPrivate: ana.signing });
  assert.equal(await reason(toEve), 'tampered');
  for (const junk of [null, {}, { type: 'media-key', key: 'x', link: '{}' }, { type: 'media-key', key: 'x'.repeat(500), link: '{}' }]) assert.notEqual(await reason(junk), undefined);
});
