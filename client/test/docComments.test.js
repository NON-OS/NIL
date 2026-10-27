import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { keyring, entry, person, signIn, route, reset, confirm } from './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const docComments = await load('components/docs/editor/docComments');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }];
let V, W;

beforeEach(async () => {
  reset();
  [V, W] = [person(), person()];
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W)]);
  await confirm(['w']);
});

const thread = (ydoc, id) => docComments.threads(ydoc).find((t) => t.id === id);
const checked = (ydoc, id, docId = 'doc-1') => docComments.verify(docId, thread(ydoc, id));
const messages = (ydoc, id) => ydoc.getMap('comments').get(id).get('messages');

test('a thread and its replies check out under their authors', async () => {
  const ydoc = new Y.Doc();
  const id = docComments.start(ydoc, 'doc-1', 'the words', 'First point');
  signIn('w', W, users);
  docComments.reply(ydoc, 'doc-1', id, 'An answer');
  signIn('v', V, users);
  const t = await checked(ydoc, id);
  assert.equal(t.by, 'v');
  assert.deepEqual(t.messages.map((m) => [m.by, m.text, m.verified]), [['v', 'First point', true], ['w', 'An answer', true]]);
});

test('a message written under someone else’s name stays unconfirmed', async () => {
  const ydoc = new Y.Doc();
  const id = docComments.start(ydoc, 'doc-1', 'the words', 'First point');
  signIn('w', W, users);
  docComments.reply(ydoc, 'doc-1', id, 'I agree');
  const list = messages(ydoc, id);
  const forged = { ...list.get(1), by: 'v' };
  list.delete(1);
  list.push([forged]);
  signIn('v', V, users);
  const t = await checked(ydoc, id);
  assert.equal(t.messages[1].verified, false);
});

test('a message moved to another thread, another doc or other words stays unconfirmed', async () => {
  const ydoc = new Y.Doc();
  const a = docComments.start(ydoc, 'doc-1', 'some words', 'About these');
  const b = docComments.start(ydoc, 'doc-1', 'other words', 'About those');
  messages(ydoc, b).push([messages(ydoc, a).get(0)]);
  assert.equal((await checked(ydoc, b)).messages[1].verified, false);
  assert.equal((await checked(ydoc, a, 'doc-2')).messages[0].verified, false);
  ydoc.getMap('comments').get(a).set('quote', 'words it never quoted');
  const moved = await checked(ydoc, a);
  assert.equal(moved.messages[0].verified, false);
  assert.equal(moved.by, '');
});

test('a message without a signature, or with its text changed, stays unconfirmed', async () => {
  const ydoc = new Y.Doc();
  const id = docComments.start(ydoc, 'doc-1', 'the words', 'Original');
  const list = messages(ydoc, id);
  const first = list.get(0);
  list.push([{ id: 'x1', by: 'v', at: Date.now(), text: 'No signature' }, { ...first, id: 'x2' }]);
  list.delete(0);
  list.insert(0, [{ ...first, text: 'Changed' }]);
  const t = await checked(ydoc, id);
  assert.deepEqual(t.messages.map((m) => m.verified), [false, false, false]);
});

test('nobody can comment while their keys are locked', () => {
  keyring.lock();
  assert.throws(() => docComments.start(new Y.Doc(), 'doc-1', 'q', 'text'), /Unlock/);
});
