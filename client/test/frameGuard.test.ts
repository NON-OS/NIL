import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import frameFooter from '../src/lib/calls/frameFooter.ts';
import frameManifest from '../src/lib/calls/frameManifest.ts';
import frameSender from '../src/lib/calls/frameSender.ts';
import frameLedger from '../src/lib/calls/frameLedger.ts';
import frameRatchet from '../src/lib/calls/frameRatchet.ts';

// Frames on the SFU carry their sender's signed word for them. Someone who holds the frame key
// (anyone in the call), with the SFU's help, can make frames that decrypt as another person's;
// those, and old frames played again, are caught within seconds, while lost frames, a receiver
// switching layers and a track that stops are not mistaken for them.
const ANA = 'ana-on-the-sfu';
const secret = ed25519.utils.randomPrivateKey();
const publicKey = ed25519.getPublicKey(secret);
const frame = (n: number, size = 90) => {
  const f = crypto.getRandomValues(new Uint8Array(size));
  f[0] = n & 0xff;
  return f;
};

// what a receiver passes on, given what Ana sends, from `ms` on, every `every` ms
function call({ frames = 100, every = 20, layer = () => 1, drop = (_: number) => false, audio = true } = {}) {
  const send = frameSender(ANA, secret);
  const ledger = frameLedger();
  ledger.key(ANA, publicKey, 0);
  const sent: Uint8Array[] = [];
  for (let i = 0; i < frames; i++) {
    const out = send.out(frame(i), layer(i), audio, i * every);
    sent.push(out);
    if (drop(i)) continue;
    const opened = frameFooter.unwrap(out)!;
    ledger.frame(ANA, 'mic', opened.frame, opened.list, i * every);
  }
  return { ledger, sent, end: frames * every };
}

test('the footer comes off as it went on, padding and list included', () => {
  const f = frame(1, 300);
  const list = frameManifest.sign([frameManifest.hash(f)], 7, ANA, secret);
  const opened = frameFooter.unwrap(frameFooter.wrap(f, list, 1024))!;
  assert.deepEqual(opened.frame, f);
  assert.deepEqual(opened.list, list);
  assert.equal(frameFooter.wrap(f, null, 1024).length, 1024 + 5);
  assert.equal(frameFooter.unwrap(f.subarray(0, 4)), null);
});

test('sound goes out at one steady size, and video in a few sizes, so neither shows what is said or done', () => {
  const send = frameSender(ANA, secret);
  const sizes = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const quiet = i % 10 < 5;
    const out = send.out(frame(i, quiet ? 12 : 95), 1, true, i * 20);
    if (!frameFooter.unwrap(out)!.list) sizes.add(out.length);
  }
  assert.equal(sizes.size, 2, 'one size before the loudest frame, one after');
  assert.equal(frameFooter.target(1000, false, 0), 1024);
  assert.ok(frameFooter.target(70_000, false, 0) - 70_000 <= 70_000 / 8);
});

test('a list is signed for its sender and that sender\'s name on the SFU only', () => {
  const list = frameManifest.sign(['00112233aabbccdd'], 3, ANA, secret);
  assert.deepEqual(frameManifest.open(list, ANA, publicKey), { counter: 3, hashes: ['00112233aabbccdd'] });
  assert.equal(frameManifest.open(list, 'someone-else', publicKey), null);
  assert.equal(frameManifest.open(list, ANA, ed25519.getPublicKey(ed25519.utils.randomPrivateKey())), null);
  const bent = list.slice();
  bent[7] ^= 1;
  assert.equal(frameManifest.open(bent, ANA, publicKey), null);
});

test('a call with nothing forged raises nothing, even losing frames and switching layers', () => {
  const lossy = call({ frames: 500, drop: (i) => i % 7 === 3 });
  assert.deepEqual(lossy.ledger.check(lossy.end + 3000), []);
  // video in three layers; the receiver gets one, then another
  const layers = call({ frames: 600, every: 11, audio: false, layer: (i) => (i % 3) + 1, drop: (i) => (i < 300 ? i % 3 !== 0 : i % 3 !== 2) });
  assert.deepEqual(layers.ledger.check(layers.end + 3000), []);
  // a track that stops leaves its last frames unlisted
  const stopped = call({ frames: 237 });
  assert.deepEqual(stopped.ledger.check(stopped.end + 60_000), []);
});

test('frames Ana never sent, made with her frame key, stop her being shown', () => {
  const { ledger, end } = call({ frames: 200 });
  let passed = 0;
  for (let i = 0; i < 40; i++) if (ledger.frame(ANA, 'mic', frame(1000 + i), null, end + i * 20)) passed++;
  assert.equal(passed, 40, 'they play until caught, a few seconds at most');
  assert.deepEqual(ledger.check(end + 3000), [ANA]);
  assert.equal(ledger.frame(ANA, 'mic', frame(5000), null, end + 3100), false, 'and nothing of hers plays after');
});

test('her own frames played again, or with an old list, are caught too', () => {
  const { ledger, sent, end } = call({ frames: 200 });
  for (const out of sent.slice(100, 140)) {
    const opened = frameFooter.unwrap(out)!;
    ledger.frame(ANA, 'mic', opened.frame, opened.list, end + 100);
  }
  assert.deepEqual(ledger.check(end + 3000), [ANA]);
});

test('frames without the footer, sent around the browser\'s own encryption, count against the sender', () => {
  const ledger = frameLedger();
  ledger.key(ANA, publicKey, 0);
  for (let i = 0; i < 16; i++) ledger.unwrapped(ANA, 'mic', i);
  assert.deepEqual(ledger.check(100), [ANA]);
});

test('a key stepped forward for a newcomer is the one LiveKit steps to when a frame fails', async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const material = await crypto.subtle.importKey('raw', key, 'HKDF', false, ['deriveBits']);
  const theirs = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', salt: new TextEncoder().encode(frameRatchet.salt), hash: 'SHA-256', info: new ArrayBuffer(128) }, material, 256));
  assert.deepEqual(frameRatchet(key), theirs);
  assert.notDeepEqual(frameRatchet(key), key);
});

test('frames that came before their sender\'s key are not held against them', () => {
  const send = frameSender(ANA, secret);
  const ledger = frameLedger();
  // seconds of video in three layers before Ana's key reaches this browser: it can't decrypt
  // them either, so it doesn't judge them
  let t = 0;
  for (; t < 4000; t += 11) {
    const opened = frameFooter.unwrap(send.out(frame(t), (t % 3) + 1, false, t))!;
    ledger.frame(ANA, 'cam', opened.frame, opened.list, t);
  }
  ledger.key(ANA, publicKey, t);
  for (const end = t + 4000; t < end; t += 11) {
    const opened = frameFooter.unwrap(send.out(frame(t), (t % 3) + 1, false, t))!;
    ledger.frame(ANA, 'cam', opened.frame, opened.list, t);
  }
  assert.deepEqual(ledger.check(t + 3000), []);
});

test('sound and video stopping together, as when someone leaves, are not taken for forgery', () => {
  const sound = frameSender(ANA, secret);
  const video = frameSender(ANA, secret);
  const ledger = frameLedger();
  ledger.key(ANA, publicKey, 0);
  // sound in 20 ms frames, video at 25 frames a second
  for (let t = 0; t < 3190; t += 20) {
    const s = frameFooter.unwrap(sound.out(frame(t), 1, true, t))!;
    ledger.frame(ANA, 'mic', s.frame, s.list, t);
    if (t % 40 === 0) {
      const v = frameFooter.unwrap(video.out(frame(t + 1), 2, false, t))!;
      ledger.frame(ANA, 'cam', v.frame, v.list, t);
    }
  }
  assert.deepEqual(ledger.check(60_000), []);
});
