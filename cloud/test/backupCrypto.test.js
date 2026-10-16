import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import backupKeys from '../backups/backupKeys.js';
import backupFormat from '../backups/backupFormat.js';
import sealStream from '../backups/sealStream.js';
import openStream from '../backups/openStream.js';
import collect from './helpers/collect.js';

async function seal(data, publicKeys) {
  return collect(Readable.from([data]).pipe(sealStream(publicKeys.map((k) => backupKeys.parsePublic(k)))));
}

async function open(sealed, secretKey) {
  const out = [];
  await pipeline(Readable.from([sealed]), openStream(backupKeys.parseSecret(secretKey)), async (source) => {
    for await (const chunk of source) out.push(chunk);
  });
  return Buffer.concat(out);
}

test('keys round-trip as text, and a typo in a key is caught by its checksum', () => {
  const { publicKey, secretKey } = backupKeys.generate();
  assert.match(publicKey, /^nilbk-pub-[A-Za-z0-9_-]{48}$/);
  assert.match(secretKey, /^nilbk-sec-[A-Za-z0-9_-]{48}$/);
  const secret = backupKeys.parseSecret(`# comment\n# another\n${secretKey}\n`);
  assert.equal(backupKeys.publicText(crypto.createPublicKey(secret)), publicKey);
  const typo = publicKey.slice(0, 20) + (publicKey[20] === 'A' ? 'B' : 'A') + publicKey.slice(21);
  assert.equal(backupKeys.parsePublic(typo), null);
  assert.equal(backupKeys.parsePublic(publicKey.slice(0, -1)), null);
  assert.equal(backupKeys.parsePublic(secretKey), null);
});

test('backups decrypt to exactly what went in, for every size around the chunk boundary', async () => {
  const keys = backupKeys.generate();
  const chunk = backupFormat.chunkSize;
  for (const size of [0, 1, chunk - 1, chunk, chunk + 1, 2 * chunk, 3 * chunk + 17]) {
    const data = crypto.randomBytes(size);
    const sealed = await seal(data, [keys.publicKey]);
    // a run of 16 or more random bytes reappearing by chance is out of the question
    if (size >= 16) assert.ok(!sealed.includes(data.subarray(0, 16)), 'plaintext must not appear in the output');
    assert.deepEqual(await open(sealed, keys.secretKey), data, `size ${size}`);
  }
});

test('any one of several recipients can decrypt; anyone else can’t', async () => {
  const [a, b, c] = [backupKeys.generate(), backupKeys.generate(), backupKeys.generate()];
  const data = crypto.randomBytes(100_000);
  const sealed = await seal(data, [a.publicKey, b.publicKey]);
  assert.deepEqual(await open(sealed, a.secretKey), data);
  assert.deepEqual(await open(sealed, b.secretKey), data);
  await assert.rejects(open(sealed, c.secretKey), /isn’t encrypted to that key/);
});

test('tampering, truncation and extension are all detected', async () => {
  const keys = backupKeys.generate();
  const chunk = backupFormat.chunkSize;
  const data = crypto.randomBytes(2 * chunk + 500);
  const sealed = await seal(data, [keys.publicKey]);
  const headerLength = 8 + 2 + backupFormat.stanzaLength + backupFormat.saltLength + backupFormat.macLength;
  const flip = (at) => {
    const copy = Buffer.from(sealed);
    copy[at] ^= 1;
    return copy;
  };
  await assert.rejects(open(flip(headerLength - 40), keys.secretKey), /damaged/); // the salt, covered by the MAC
  await assert.rejects(open(flip(headerLength + 10), keys.secretKey), /damaged/); // first chunk
  await assert.rejects(open(flip(sealed.length - 1), keys.secretKey), /damaged/); // last tag
  // cut exactly after a full chunk: the remaining chunk was not sealed as the last one
  await assert.rejects(open(sealed.subarray(0, headerLength + chunk + 16), keys.secretKey), /damaged/);
  await assert.rejects(open(sealed.subarray(0, sealed.length - 5), keys.secretKey), /damaged/);
  await assert.rejects(open(Buffer.concat([sealed, crypto.randomBytes(40)]), keys.secretKey), /damaged/);
  await assert.rejects(open(Buffer.from('NOTABACKUPFILE'), keys.secretKey), /isn’t a Nil backup/);
});
