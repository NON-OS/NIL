import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { store, keyring, entry, person, signIn, route, reset, confirm, sent } from './helpers/fakeBrowser.js';

// the editor's schema code looks at the page's root element when it loads
document.documentElement ??= { style: {} };

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const docs = await load('actions/docs');
const docUpdateSeal = await load('actions/docUpdateSeal');
const docLiveCipher = await load('lib/crypto/docLiveCipher');
const markdownToState = await load('lib/docState/markdownToState');
const applyTextDiff = await load('lib/docState/applyTextDiff');
const stateToJson = await load('lib/docState/stateToJson');
const jsonText = await load('lib/docState/jsonText');
const docBody = await load('lib/docState/docBody');
const createLiveDoc = await load('actions/liveDoc/createLiveDoc');
const liveDocs = await load('actions/liveDoc/liveDocs');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }];
let V, W, stored, updates;

// A paragraph added to the body, as a Yjs change made on top of `state`.
function paragraph(state, text) {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  const before = Y.encodeStateVector(ydoc);
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText(text)]);
  ydoc.getXmlFragment('body').push([p]);
  return Y.encodeStateAsUpdate(ydoc, before);
}

// Seals a change as Wen would in her own browser, then signs Vic back in.
async function asWen(docId, key, update) {
  signIn('w', W, users);
  const sealed = await docUpdateSeal.seal(docId, key, update);
  signIn('v', V, users);
  return sealed;
}

const words = (ydoc) => jsonText(stateToJson(Y.encodeStateAsUpdate(ydoc)).content);

beforeEach(async () => {
  reset();
  [V, W] = [person(), person()];
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W)]);
  await confirm(['w']);
  updates = [];
  route('POST', '/api/docs', (url, b) => {
    stored = { id: b.id, version: 1, audience: b.audience, titleCt: b.titleCt, bodyCt: b.bodyCt, wrappedKey: b.grants.find((g) => g.userId === 'v').wrappedKey, createdBy: 'v', updatedBy: 'v', createdAt: 1, updatedAt: 1, readers: b.grants.map((g) => g.userId) };
    return { doc: stored };
  });
  route('GET', /^\/api\/docs\/[\w-]+$/, () => ({ doc: { ...stored, updatesThrough: 0, updates } }));
});

test('a live change opens only as the change, doc and kind it was sealed as', async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const id = docLiveCipher.newId();
  const ct = await docLiveCipher.seal(key, 'doc-a', 'update', id, new Uint8Array([1, 2, 3]));
  assert.deepEqual([...(await docLiveCipher.open(key, 'doc-a', 'update', ct)).payload], [1, 2, 3]);
  await assert.rejects(docLiveCipher.open(key, 'doc-b', 'update', ct));
  await assert.rejects(docLiveCipher.open(key, 'doc-a', 'aware', ct));
  await assert.rejects(docLiveCipher.open(crypto.getRandomValues(new Uint8Array(32)), 'doc-a', 'update', ct));
});

test('a teammate’s change checks out; one from outside the readers, or with a forged author, doesn’t', async () => {
  const doc = await docs.create({ title: 'Plan', audience: 'people', people: ['w'] });
  const key = keyring.docKey(doc.id).slice();
  const { ct } = await asWen(doc.id, key, new Uint8Array([7]));
  assert.equal((await docUpdateSeal.open(doc.id, key, ct, ['v', 'w'])).verified, true);
  // the server lists Wen as no longer reading, or claims the change came from Vic
  assert.equal((await docUpdateSeal.open(doc.id, key, ct, ['v'])).verified, false);
  const forged = await docUpdateSeal.seal(doc.id, key, new Uint8Array([9]));
  const opened = await docUpdateSeal.open(doc.id, key, forged.ct, ['v', 'w']);
  assert.equal(opened.by, 'v');
  assert.equal(opened.verified, true);
  // a change with its bytes altered on the way doesn't open at all
  const bad = ct.slice(0, -4) + (ct.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  await assert.rejects(docUpdateSeal.open(doc.id, key, bad, ['v', 'w']));
});

test('Markdown from before Docs v2 converts the same in every tab, so it never shows twice', () => {
  const a = markdownToState('doc1', 3, 'Runbook', '# Restart\n\n- stop the node\n- start it');
  const b = markdownToState('doc1', 3, 'Runbook', '# Restart\n\n- stop the node\n- start it');
  assert.deepEqual(a, b);
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, a);
  Y.applyUpdate(ydoc, b);
  assert.equal(words(ydoc).match(/stop the node/g).length, 1);
  assert.equal(ydoc.getText('title').toString(), 'Runbook');
});

test('two people typing in the title at once both keep their words', () => {
  const [one, two] = [new Y.Doc(), new Y.Doc()];
  one.getText('title').insert(0, 'Launch plan');
  Y.applyUpdate(two, Y.encodeStateAsUpdate(one));
  applyTextDiff(one.getText('title'), 'Q3 Launch plan');
  applyTextDiff(two.getText('title'), 'Launch plan draft');
  Y.applyUpdate(one, Y.encodeStateAsUpdate(two));
  Y.applyUpdate(two, Y.encodeStateAsUpdate(one));
  assert.equal(one.getText('title').toString(), 'Q3 Launch plan draft');
  assert.equal(two.getText('title').toString(), 'Q3 Launch plan draft');
});

test('the open doc applies changes in order, fetches what it missed, leaves out forgeries and saves', async () => {
  const created = await docs.create({ title: 'Notes', audience: 'people', people: ['w'] });
  const key = keyring.docKey(created.id).slice();
  const start = await docs.open(created.id);
  const base = docBody.decode(start.body);
  const first = await asWen(created.id, key, paragraph(base, 'first from Wen'));
  const second = await asWen(created.id, key, paragraph(base, 'second from Wen'));
  updates = [];
  route('GET', new RegExp(`^/api/docs/${created.id}/updates\\?after=0$`), () => ({ updates: [{ seq: 1, updateCt: first.ct, by: 'w', at: 1 }, { seq: 2, updateCt: second.ct, by: 'w', at: 2 }], version: 1 }));
  route('POST', `/api/docs/${created.id}/updates`, () => ({ seq: 3 }));
  route('PUT', `/api/docs/${created.id}`, (url, b) => {
    stored = { ...stored, version: 2, titleCt: b.titleCt, bodyCt: b.bodyCt };
    return { doc: { ...stored, updatesThrough: b.through } };
  });

  const live = await createLiveDoc(await docs.open(created.id), 'v', () => {});
  // the second change arrives first: the tab fetches the first instead of skipping it
  liveDocs.dispatch({ type: 'doc-update', docId: created.id, seq: 2, updateCt: second.ct, by: 'w', at: 2 });
  await new Promise((r) => setTimeout(r, 50));
  assert.match(words(live.ydoc), /first from Wen/);
  assert.match(words(live.ydoc), /second from Wen/);
  assert.ok(sent.some((r) => r.url === `/api/docs/${created.id}/updates?after=0`));

  // a change the server made up, sealed with a key it doesn't hold, is counted and left out
  const fake = await docLiveCipher.seal(crypto.getRandomValues(new Uint8Array(32)), created.id, 'update', docLiveCipher.newId(), new Uint8Array([1]));
  liveDocs.dispatch({ type: 'doc-update', docId: created.id, seq: 3, updateCt: fake, by: 'w', at: 3 });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(live.status().refused, 1);

  // Vic types: the change goes out sealed as his, and closing saves a version that covers it all
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText('reply from Vic')]);
  live.ydoc.getXmlFragment('body').push([p]);
  await live.close();
  const posted = sent.find((r) => r.method === 'POST' && r.url === `/api/docs/${created.id}/updates`);
  const opened = await docUpdateSeal.open(created.id, key, posted.body.updateCt, ['v', 'w']);
  assert.equal(opened.verified, true);
  const put = sent.find((r) => r.method === 'PUT' && r.url === `/api/docs/${created.id}`);
  assert.equal(put.body.through, 3);
  assert.equal(store.get().me.id, 'v');
});
