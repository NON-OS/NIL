import { test } from 'node:test';
import assert from 'node:assert/strict';
import { x25519 } from '@noble/curves/ed25519';
import callSignal from '../src/lib/crypto/callSignal.ts';
import sealedBox from '../src/lib/crypto/sealedBox.ts';

// What browsers in a call say to each other goes through Nil's server sealed: the server can't
// read a session description, tell an offer from a frame key, or change one unnoticed.
const person = () => {
  const privateKey = x25519.utils.randomPrivateKey();
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
};
const ben = person();
const eve = person();
const sdp = `v=0\r\no=- 1 2 IN IP4 203.0.113.7\r\na=fingerprint:sha-256 ${'AB:'.repeat(31)}AB\r\n${'a=candidate:1 1 udp 1 203.0.113.7 50000 typ relay\r\n'.repeat(20)}`;

test('only the person it is for can open it, and the server sees nothing of what is inside', async () => {
  const offer = { type: 'offer', sdp, link: 'signed' };
  const sealed = await callSignal.seal(offer, ben.publicKey);
  const wire = JSON.stringify(sealed);
  for (const secret of ['203.0.113.7', 'fingerprint', 'offer', 'candidate']) assert.ok(!wire.includes(secret), secret);
  assert.deepEqual(await callSignal.open(sealed, ben), offer);
  assert.equal(await callSignal.open(sealed, eve), null);
});

test('messages of every kind come out a few sizes, so their kind does not show', async () => {
  const sizes = new Set<number>();
  for (const message of [{ type: 'restart' }, { type: 'refused' }, { type: 'media-key', key: 'k'.repeat(120), link: 'l'.repeat(900) }]) sizes.add((await callSignal.seal(message, ben.publicKey)).box.length);
  assert.equal(sizes.size, 1);
});

test('a blob changed on the way, or not sealed at all, opens to nothing', async () => {
  const sealed = await callSignal.seal({ type: 'restart' }, ben.publicKey);
  const bent = { ...sealed, box: sealed.box.slice(0, 60) + (sealed.box[60] === 'A' ? 'B' : 'A') + sealed.box.slice(61) };
  assert.equal(await callSignal.open(bent, ben), null);
  assert.equal(await callSignal.open({ type: 'offer', sdp }, ben), null);
});

test('a small blob that would unpack into a huge one is refused', async () => {
  const zeros = new Uint8Array(5_000_000);
  const reader = new Blob([zeros]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const packed = new Uint8Array(await new Response(reader).arrayBuffer());
  const padded = new Uint8Array(Math.ceil((packed.length + 4) / 512) * 512);
  new DataView(padded.buffer).setUint32(0, packed.length);
  padded.set(packed, 4);
  const bomb = { type: 'sealed', box: await sealedBox('nil/call-signal/v1').seal(padded, ben.publicKey) };
  assert.equal(await callSignal.open(bomb, ben), null);
});
