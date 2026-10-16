import { test } from 'node:test';
import assert from 'node:assert/strict';
import identityFromSeed from '../src/lib/crypto/identityFromSeed.ts';
import signedText from '../src/lib/crypto/signedText.ts';
import docText from '../src/lib/crypto/docText.ts';
import taskText from '../src/lib/crypto/taskText.ts';

const person = () => identityFromSeed(crypto.getRandomValues(new Uint8Array(32)));
const key = () => crypto.getRandomValues(new Uint8Array(32));

test('signed text verifies only for its author, its place and its exact words', () => {
  const ana = person();
  const ben = person();
  const json = signedText.seal('Ship on Friday', { context: 'nil/doc/d1/body/v3', by: 'ana', signingPrivate: ana.signingPrivate });
  const signed = signedText.open(json);
  assert.equal(signed.text, 'Ship on Friday');
  assert.equal(signedText.verify(signed, 'nil/doc/d1/body/v3', ana.signingKey), true);
  assert.equal(signedText.verify(signed, 'nil/doc/d1/body/v3', ben.signingKey), false);
  assert.equal(signedText.verify(signed, 'nil/doc/d1/body/v4', ana.signingKey), false);
  assert.equal(signedText.verify(signed, 'nil/doc/d2/body/v3', ana.signingKey), false);
  assert.equal(signedText.verify({ ...signed, text: 'Ship on Monday' }, 'nil/doc/d1/body/v3', ana.signingKey), false);
  assert.equal(signedText.verify({ ...signed, by: 'ben' }, 'nil/doc/d1/body/v3', ana.signingKey), false);
  assert.throws(() => signedText.open('"just text"'), /isn’t signed/);
});

test('a doc ciphertext opens only as the version it was sealed for', async () => {
  const k = key();
  const at = { docId: 'd1', field: 'body', version: 4 };
  const blob = await docText.seal(k, at, 'payload');
  assert.equal(await docText.open(k, at, blob), 'payload');
  // a server serving version 4's text as version 5, or as the title, or under another doc, fails
  await assert.rejects(docText.open(k, { ...at, version: 5 }, blob));
  await assert.rejects(docText.open(k, { ...at, field: 'title' }, blob));
  await assert.rejects(docText.open(k, { ...at, docId: 'd2' }, blob));
});

test('content the server makes up under a key of its own doesn’t pass as a member’s', async () => {
  const ana = person();
  const mallory = person();
  // the server can seal any key to Ana's public key and write under it, but has no member's signing key
  const forgedKey = key();
  const injected = await taskText.seal(forgedKey, 's1', 'title', signedText.seal('Wire funds to 0xbad', { context: taskText.context('s1', 'title'), by: 'ana', signingPrivate: mallory.signingPrivate }));
  const opened = signedText.open(await taskText.open(forgedKey, 's1', 'title', injected));
  assert.equal(opened.by, 'ana');
  assert.equal(signedText.verify(opened, taskText.context('s1', 'title'), ana.signingKey), false);
});
