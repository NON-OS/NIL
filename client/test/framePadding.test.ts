import { test } from 'node:test';
import assert from 'node:assert/strict';
import framePadding from '../src/lib/calls/framePadding.ts';
import meshShaping from '../src/actions/calls/meshShaping.ts';

// Browser to browser, the relay sees packet sizes: sound goes at a constant bitrate and video in
// a few padded sizes, and the padding comes off exactly.
test('video padding comes off exactly, and an unpadded frame is left as it is', () => {
  for (const size of [1, 63, 64, 1000, 4097, 90_001]) {
    const frame = new Uint8Array(size).map((_, i) => (i * 7 + size) & 0xff);
    const padded = framePadding.pad(frame);
    assert.ok(padded.length >= frame.length && padded.length - frame.length <= Math.max(72, frame.length / 8 + 8));
    assert.deepEqual(framePadding.strip(padded), frame);
    assert.deepEqual(framePadding.strip(frame), frame);
  }
  // 400 frames between 3 and 5 KB go out in a handful of sizes
  const sizes = new Set(Array.from({ length: 400 }, (_, i) => framePadding.pad(new Uint8Array(3000 + i * 5)).length));
  assert.ok(sizes.size <= 8, `${sizes.size} sizes for 400 frames`);
});

test('sound comes out one size, the largest it has needed', () => {
  let floor = 0;
  const sizes = new Set<number>();
  for (const n of [40, 95, 12, 60, 95, 3, 80]) {
    const out = framePadding.pad(new Uint8Array(n), true, floor);
    floor = out.length - 8;
    if (n !== 40) sizes.add(out.length);
  }
  assert.equal(sizes.size, 1);
});

test('a frame that happens to end like padding, with a length that cannot fit, is left alone', () => {
  const frame = new Uint8Array([1, 2, 3, 0xff, 0xff, 0xff, 0xff, 0x4e, 0x49, 0x4c, 0x50]);
  assert.deepEqual(framePadding.strip(frame), frame);
});

test('each description asks for sound at a constant bitrate, never paused for silence', () => {
  const sdp = 'v=0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1;usedtx=1\r\na=rtpmap:96 VP8/90000\r\n';
  const out = meshShaping.constantSound(sdp);
  assert.match(out, /a=fmtp:111 minptime=10;useinbandfec=1;cbr=1;usedtx=0\r\n/);
  assert.equal(meshShaping.constantSound(out), out);
  assert.equal(meshShaping.constantSound('v=0\r\n'), 'v=0\r\n');
});
