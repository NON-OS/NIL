import { test } from 'node:test';
import assert from 'node:assert/strict';
import identityFromSeed from '../src/lib/crypto/identityFromSeed.ts';
import signedText from '../src/lib/crypto/signedText.ts';
import docText from '../src/lib/crypto/docText.ts';
import taskText from '../src/lib/crypto/taskText.ts';
import taskRevision from '../src/lib/crypto/taskRevision.ts';
import isRollback from '../src/lib/isRollback.ts';

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

test('a private task’s revision is signed, so an old version can’t be passed off as a newer one', async () => {
  const ana = person();
  const taskKey = key();
  const sealAt = (text, rev) => taskText.seal(taskKey, 's1', 'title', taskRevision.add(signedText.seal(text, { context: taskText.context('s1', 'title', rev), by: 'ana', signingPrivate: ana.signingPrivate }), rev));
  const openAt = async (blob) => {
    const json = await taskText.open(taskKey, 's1', 'title', blob);
    return { signed: signedText.open(json), rev: taskRevision.of(json) };
  };
  const old = await openAt(await sealAt('Pay Ben 100', 3));
  assert.equal(old.rev, 3);
  assert.equal(signedText.verify(old.signed, taskText.context('s1', 'title', 3), ana.signingKey), true);
  // the same words claimed as a later revision no longer carry a valid signature
  assert.equal(signedText.verify(old.signed, taskText.context('s1', 'title', 4), ana.signingKey), false);
  assert.equal(signedText.verify(old.signed, taskText.context('s1', 'title'), ana.signingKey), false);
});

test('private tasks sealed before revisions open as revision 0 under the context they were signed with', async () => {
  const ana = person();
  const taskKey = key();
  const blob = await taskText.seal(taskKey, 's1', 'title', signedText.seal('Old words', { context: 'nil/task/s1/title', by: 'ana', signingPrivate: ana.signingPrivate }));
  const json = await taskText.open(taskKey, 's1', 'title', blob);
  assert.equal(taskRevision.of(json), 0);
  assert.equal(taskText.context('s1', 'title', 0), 'nil/task/s1/title');
  assert.equal(signedText.verify(signedText.open(json), taskText.context('s1', 'title', 0), ana.signingKey), true);
});

test('a revision has to be a whole number in range', () => {
  const signed = signedText.seal('x', { context: 'c', by: 'ana', signingPrivate: person().signingPrivate });
  assert.equal(taskRevision.of(taskRevision.add(signed, 7)), 7);
  for (const rev of [-1, 1.5, '3', 2 ** 31, Number.MAX_SAFE_INTEGER + 2, null]) {
    assert.throws(() => taskRevision.of(JSON.stringify({ ...JSON.parse(signed), rev })), /revision number/, String(rev));
  }
});

test('a rollback is an older revision than one seen, or pieces from different revisions', () => {
  assert.equal(isRollback([5, 5, 5], 5), false);
  assert.equal(isRollback([6, 6], 5), false);
  assert.equal(isRollback([0, 0], 0), false);
  assert.equal(isRollback([4, 4, 4], 5), true);
  assert.equal(isRollback([6, 6, 5], 0), true);
  assert.equal(isRollback([5, 6], 0), true);
});
