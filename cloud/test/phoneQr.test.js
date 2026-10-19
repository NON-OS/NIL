import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import qr from '../phone/qr.js';

// The sign-up page draws its pairing code with a copy of the web app's QR encoder. Wherever the
// web app's source sits next to this folder, the two must draw every code alike.
const original = new URL('../../client/src/lib/qr.ts', import.meta.url);

test('the sign-up page’s QR encoder draws what the web app’s does', { skip: !fs.existsSync(original) && 'the web app’s source isn’t here' }, async () => {
  const { default: webQr } = await import(original);
  const pairing = `wc:${'3f'.repeat(32)}@2?relay-protocol=irn&symKey=${'a9'.repeat(32)}&expiryTimestamp=1760000300`;
  for (const text of ['', 'a', 'https://nil.example/', pairing, `${pairing}&methods=personal_sign`, 'é'.repeat(300), 'x'.repeat(1200)]) {
    assert.deepEqual(qr(text), webQr(text), `${text.slice(0, 20)}… (${text.length} characters)`);
  }
  assert.equal(qr(pairing).length, 57, 'a pairing link fits version 10');
});
