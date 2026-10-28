import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { store, keyring, entry, person, signIn, route, reset, confirm, sent } from './helpers/fakeBrowser.js';

// What a hostile reader can send into a doc, and what each tab does with it: crafted changes and
// versions refused before the editor sees them, cursors checked, and an inbox that never stalls.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const createStateGuard = await load('lib/docState/createStateGuard');
const awarenessCheck = await load('lib/docState/awarenessCheck');
const stateText = await load('lib/docState/stateText');
const docBody = await load('lib/docState/docBody');
const docs = await load('actions/docs');
const docUpdateSeal = await load('actions/docUpdateSeal');
const stateToJson = await load('lib/docState/stateToJson');
const jsonText = await load('lib/docState/jsonText');
const createLiveDoc = await load('actions/liveDoc/createLiveDoc');
const liveDocs = await load('actions/liveDoc/liveDocs');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }];
const words = (ydoc) => jsonText(stateToJson(Y.encodeStateAsUpdate(ydoc)).content);

// A change another tab made to `base`, built by `edit` on its own copy.
function change(base, edit) {
  const other = new Y.Doc();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(base));
  const before = Y.encodeStateVector(other);
  edit(other);
  return Y.encodeStateAsUpdate(other, before);
}

function paragraph(text, attrs = {}) {
  const p = new Y.XmlElement('paragraph');
  for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
  p.insert(0, [new Y.XmlText(text)]);
  return p;
}

function table(colspan) {
  const t = new Y.XmlElement('table');
  const row = new Y.XmlElement('tableRow');
  const cell = new Y.XmlElement('tableCell');
  cell.setAttribute('colspan', colspan);
  cell.insert(0, [paragraph('x')]);
  row.insert(0, [cell]);
  t.insert(0, [row]);
  return t;
}

// quotes in quotes, `levels` deep, built one level at a time as a script would
function nest(d, levels) {
  let parent = d.getXmlFragment('body');
  for (let i = 0; i < levels; i++) {
    const quote = new Y.XmlElement('blockquote');
    parent.insert(parent.length, [quote]);
    parent = quote;
  }
  parent.insert(0, [paragraph('deep')]);
}

test('ordinary changes go through; crafted ones are refused and leave the doc as it was', () => {
  const doc = new Y.Doc();
  doc.getXmlFragment('body').push([paragraph('Hello')]);
  const guard = createStateGuard(doc);
  const ok = change(doc, (d) => d.getXmlFragment('body').push([paragraph('More', { textAlign: 'center' })]));
  assert.ok(guard.accepts(ok));
  Y.applyUpdate(doc, ok);

  const attacks = {
    'a table cell spanning a hundred million columns': (d) => d.getXmlFragment('body').push([table(1e8)]),
    'blocks nested three thousand deep': (d) => nest(d, 3000),
    'a node the editor has never heard of': (d) => d.getXmlFragment('body').push([new Y.XmlElement('script')]),
    'a link that runs script': (d) => d.getXmlFragment('body').get(0).get(0).format(0, 2, { link: { href: 'javascript:alert(1)' } }),
    'an attribute nothing defines': (d) => d.getXmlFragment('body').get(0).setAttribute('onclick', 'x'),
    'a top-level piece Nil never writes': (d) => d.getMap('elsewhere').set('x', 1),
    'a title too long to save': (d) => d.getText('title').insert(0, 'x'.repeat(5000)),
    'a comment whose time is a word': (d) => {
      const t = new Y.Map();
      d.getMap('comments').set('t1', t);
      t.set('at', 'yesterday');
    },
  };
  for (const [name, edit] of Object.entries(attacks)) assert.equal(guard.accepts(change(doc, edit)), false, name);
  assert.equal(words(doc).trim(), 'Hello\nMore');
  // refusals leave the guard working for whatever comes next
  assert.ok(guard.accepts(change(doc, (d) => d.getXmlFragment('body').push([paragraph('Still fine')]))));
  guard.stop();
});

test('a crafted saved version neither opens nor breaks the list or history', async () => {
  const bad = new Y.Doc();
  nest(bad, 3000);
  const body = docBody.encode(Y.encodeStateAsUpdate(bad));
  assert.equal(stateText(body), '');
  assert.throws(() => stateToJson(docBody.decode(body)), /can’t show safely/);
});

// a cursor update as y-protocols encodes it
function cursor(entries) {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, entries.length);
  for (const [clientID, state] of entries) {
    encoding.writeVarUint(e, clientID);
    encoding.writeVarUint(e, 1);
    encoding.writeVarString(e, JSON.stringify(state));
  }
  return encoding.toUint8Array(e);
}

test('a cursor is only taken for the account that sent it, in the shape the editor draws', () => {
  const at = { type: { client: 1, clock: 0 }, tname: null, item: null, assoc: 0 };
  const good = { user: { id: 'w', color: '#3366aa' }, cursor: { anchor: at, head: at } };
  assert.equal(awarenessCheck(cursor([[7, good]]), 'w'), 7);
  assert.equal(awarenessCheck(cursor([[7, null]]), 'w'), 7);
  assert.equal(awarenessCheck(cursor([[7, good]]), 'v'), null, 'someone else’s name on it');
  assert.equal(awarenessCheck(cursor([[7, good], [8, good]]), 'w'), null, 'more than one cursor');
  assert.equal(awarenessCheck(cursor([[7, { ...good, cursor: {} }]]), 'w'), null, 'a cursor that throws when drawn');
  assert.equal(awarenessCheck(cursor([[7, { ...good, name: 'CFO' }]]), 'w'), null, 'fields Nil never sends');
  assert.equal(awarenessCheck(cursor([[7, { user: { id: 'w', color: 'red;background:url(x)' } }]]), 'w'), null);
  assert.equal(awarenessCheck(new Uint8Array([1, 2]), 'w'), null);
  assert.equal(awarenessCheck(cursor([[7, { ...good, user: { ...good.user, name: 'CFO' } }]]), 'w'), null, 'a name of its own');
});

test('a cursor as the editor really sends it gets through', () => {
  const doc = new Y.Doc();
  const para = new Y.XmlElement('paragraph');
  doc.getXmlFragment('default').insert(0, [para]);
  para.insert(0, [new Y.XmlText('hello')]);
  const awareness = new Awareness(doc);
  // what the caret extension sets: its own empty name beside Nil's id and colour
  awareness.setLocalStateField('user', { name: null, color: '#007C85', id: 'w' });
  const at = Y.createRelativePositionFromTypeIndex(para.get(0), 2, -1);
  awareness.setLocalStateField('cursor', { anchor: at, head: at });
  const update = encodeAwarenessUpdate(awareness, [awareness.clientID]);
  awareness.destroy();
  assert.equal(awarenessCheck(update, 'w'), awareness.clientID);
});

beforeEach(() => reset());

test('after missing changes a newer version covers, the open doc reloads and carries on', async () => {
  const [V, W] = [person(), person()];
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W)]);
  await confirm(['w']);
  let stored;
  let through = 0;
  route('POST', '/api/docs', (url, b) => {
    stored = { id: b.id, version: 1, audience: b.audience, titleCt: b.titleCt, bodyCt: b.bodyCt, wrappedKey: b.grants.find((g) => g.userId === 'v').wrappedKey, createdBy: 'v', updatedBy: 'v', createdAt: 1, updatedAt: 1, readers: b.grants.map((g) => g.userId) };
    return { doc: stored };
  });
  route('GET', /^\/api\/docs\/[\w-]+$/, () => ({ doc: { ...stored, updatesThrough: through, updates: [] } }));
  const created = await docs.create({ title: 'N', audience: 'people', people: ['w'] });
  const key = keyring.docKey(created.id).slice();
  const base = new Y.Doc();
  Y.applyUpdate(base, docBody.decode((await docs.open(created.id)).body));
  signIn('w', W, users);
  const u3 = await docUpdateSeal.seal(created.id, key, change(base, (d) => d.getXmlFragment('body').push([paragraph('third from Wen')])));
  const u4 = await docUpdateSeal.seal(created.id, key, change(base, (d) => d.getXmlFragment('body').push([paragraph('fourth from Wen')])));
  signIn('v', V, users);

  const live = await createLiveDoc(await docs.open(created.id), 'v', () => {});
  // changes 1 and 2 were missed while the connection was down, and a version since covers them
  through = 2;
  route('GET', new RegExp(`/api/docs/${created.id}/updates\\?after=0$`), () => {
    throw Object.assign(new Error('A newer version covers those changes.'), { status: 409 });
  });
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => (/\/updates\?after=0$/.test(url) ? (sent.push({ method: 'GET', url }), new Response('{"error":"newer"}', { status: 409 })) : orig(url, opts));
  liveDocs.dispatch({ type: 'doc-update', docId: created.id, seq: 3, updateCt: u3.ct, by: 'w', at: Date.now() });
  await new Promise((r) => setTimeout(r, 200));
  liveDocs.dispatch({ type: 'doc-update', docId: created.id, seq: 4, updateCt: u4.ct, by: 'w', at: Date.now() });
  await new Promise((r) => setTimeout(r, 200));
  globalThis.fetch = orig;
  assert.ok(sent.some((r) => /\/updates\?after=0$/.test(r.url)));
  assert.match(words(live.ydoc), /third from Wen/);
  assert.match(words(live.ydoc), /fourth from Wen/);
  assert.equal(store.get().me.id, 'v');
  await live.close();
});
