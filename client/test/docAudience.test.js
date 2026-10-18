import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { keyring, entry, person, signIn, route, reset, confirm, sent } from './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const docs = await load('actions/docs');
const docKeySeal = await load('lib/crypto/docKeySeal');
const docText = await load('lib/crypto/docText');
const signedText = await load('lib/crypto/signedText');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }, { id: 'm', name: 'Admin' }];
const grantsSent = () => sent.filter((r) => r.method === 'POST' && /\/grants$/.test(r.url));
let V, W, M, stored;

beforeEach(() => {
  reset();
  [V, W, M] = [person(), person(), person()];
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W), entry('m', M)]);
  route('POST', '/api/docs', (url, b) => {
    stored = { id: b.id, version: 1, audience: b.audience, titleCt: b.titleCt, bodyCt: b.bodyCt, wrappedKey: b.grants.find((g) => g.userId === 'v').wrappedKey, createdBy: 'v', updatedBy: 'v', createdAt: 1, updatedAt: 1, readers: b.grants.map((g) => g.userId) };
    return { doc: stored };
  });
  route('POST', /\/api\/docs\/.*\/grants/, (url, b) => ({ readers: [...stored.readers, ...b.grants.map((g) => g.userId)] }));
});

test('a doc shared with one person stays theirs when the server lists it as a team doc', async () => {
  await confirm(['w', 'm']);
  await docs.create({ title: 'Layoff list', body: 'Wen stays, Sam goes', audience: 'people', people: ['w'] });
  assert.deepEqual(stored.readers.sort(), ['v', 'w']);
  route('GET', '/api/docs', () => ({ docs: [{ ...stored, audience: 'team' }], waiting: [] }));
  const list = await docs.list();
  assert.equal(list.docs[0].audience, 'people');
  await docs.shareWithTeam(list.docs);
  assert.equal(grantsSent().length, 0);
});

test('a team doc reaches a teammate once their key is confirmed', async () => {
  await confirm(['w']);
  await docs.create({ title: 'Runbook', body: 'Restart the node', audience: 'team' });
  assert.deepEqual(stored.readers.sort(), ['v', 'w']);
  route('GET', '/api/docs', () => ({ docs: [stored], waiting: [] }));
  await confirm(['m']);
  await docs.shareWithTeam((await docs.list()).docs);
  const [posted] = grantsSent();
  assert.deepEqual(posted.body.grants.map((g) => g.userId), ['m']);
  const key = await docKeySeal.open(posted.body.grants[0].wrappedKey, M.privateKey, M.publicKey);
  assert.deepEqual(key, keyring.docKey(stored.id));
});

test('a doc in the older format opens marked as such and is never handed to the team on its own', async () => {
  await confirm(['w', 'm']);
  const K = crypto.getRandomValues(new Uint8Array(32));
  const at = (field) => ({ docId: 'old-doc-id-123456', field, version: 3 });
  const field = (f, text) => docText.seal(K, at(f), signedText.seal(text, { context: docText.context(at(f)), by: 'w', signingPrivate: W.signingPrivate }));
  const old = { id: 'old-doc-id-123456', version: 3, audience: 'team', titleCt: await field('title', 'Notes'), bodyCt: await field('body', 'From last year'), wrappedKey: await docKeySeal.seal(K, V.publicKey), createdBy: 'w', updatedBy: 'w', createdAt: 1, updatedAt: 2, readers: ['v', 'w'] };
  route('GET', '/api/docs', () => ({ docs: [old], waiting: [] }));
  const [item] = (await docs.list()).docs;
  assert.deepEqual([item.olderFormat, item.warning, item.title], [true, null, 'Notes']);
  await docs.shareWithTeam([item]);
  assert.equal(grantsSent().length, 0);
});

test('a version is signed for the readers it was saved for and the key it was saved under', async () => {
  await confirm(['w']);
  const made = await docs.create({ title: 'Plan', body: 'One', audience: 'people', people: ['w'] });
  assert.deepEqual([made.olderFormat, made.warning, made.updatedBy], [false, null, 'v']);
  let put;
  route('PUT', `/api/docs/${stored.id}`, (url, b) => ((put = b), { doc: { ...stored, version: 2, titleCt: b.titleCt, bodyCt: b.bodyCt, updatedBy: 'v' } }));
  const saved = await docs.save(made, 'Plan', 'Two');
  assert.deepEqual([saved.version, saved.body, saved.warning], [2, 'Two', null]);
  // the server can't keep the text and swap in a different key for it
  keyring.forgetDocKey(stored.id);
  const K = crypto.getRandomValues(new Uint8Array(32));
  route('GET', `/api/docs/${stored.id}`, () => ({ doc: { ...stored, version: 2, titleCt: put.titleCt, bodyCt: put.bodyCt, wrappedKey: 'x'.repeat(123) } }));
  await assert.rejects(docs.open(stored.id));
  route('GET', `/api/docs/${stored.id}`, () => ({ doc: { ...stored, version: 2, titleCt: put.titleCt, bodyCt: put.bodyCt } }));
  assert.equal((await docs.open(stored.id)).warning, null);
  assert.notDeepEqual(keyring.docKey(stored.id), K);
});
