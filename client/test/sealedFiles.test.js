import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { utf8ToBytes } from '@noble/hashes/utils';
import { store, entry, person, signIn, route, reset, confirm, b64u } from './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const taskKeys = await load('actions/taskKeys');
const taskSeal = await load('actions/taskSeal');
const fileSeal = await load('actions/fileSeal');
const uploadFile = await load('actions/uploadFile');
const putTask = await load('state/putTask');
const openSealed = await load('actions/openSealed');
const fileCipher = await load('lib/crypto/fileCipher');
const fileKeyWrap = await load('lib/crypto/fileKeyWrap');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }];
let V, W, task, key;

beforeEach(async () => {
  reset();
  [V, W] = [person(), person()];
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W)]);
  await confirm(['w']);
  key = taskKeys.fresh();
  const sealed = await taskSeal.seal({ title: 'Contracts', description: '', checklist: [] }, key, await taskKeys.wrap(key.key, ['v', 'w']), { rev: 1, readers: ['v', 'w'] });
  putTask({ id: 't1', number: 1, creatorId: 'v', assigneeId: 'w', private: true, sealed, status: 'todo', labels: [], createdAt: 1, updatedAt: 1 });
  await openSealed();
  task = store.get().tasks.t1;
});

// Attaches a file through the app and returns it as the server stored it, with its bytes.
async function attach(name, text) {
  let stored;
  const file = new File([text], name, { type: 'text/plain' });
  route('POST', '/api/tasks/t1/attachments', () => ({ attachment: stored }));
  const realSend = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'POST' && url === '/api/tasks/t1/attachments') {
      const bytes = new Uint8Array(await opts.body.arrayBuffer());
      stored = { id: `a-${name}`, taskId: 't1', uploaderId: 'v', filename: 'file', mime: 'application/octet-stream', size: bytes.length, sealed: JSON.parse(opts.headers['X-Sealed']), createdAt: 1, bytes };
    }
    return realSend(url, opts);
  };
  try {
    const shown = await uploadFile(task, file);
    return { shown, stored };
  } finally {
    globalThis.fetch = realSend;
  }
}

test('a file’s name, type and size are signed by its uploader for this task', async () => {
  const { shown, stored } = await attach('offer.txt', 'Offer: 120k');
  assert.deepEqual([shown.filename, shown.mime, shown.locked, shown.olderFormat], ['offer.txt', 'text/plain', false, false]);
  assert.equal(shown.size, 11 + fileCipher.overhead);
  assert.equal(new TextDecoder().decode(await fileSeal.decrypt(task, stored.sealed, stored.bytes)), 'Offer: 120k');
  // the server can't move the file to another task, or pass one file's details off as another's
  assert.equal((await fileSeal.open({ ...task, id: 't2' }, stored)).locked, true);
  const other = (await attach('note.txt', 'Hello')).stored;
  assert.equal((await fileSeal.open(task, { ...stored, sealed: { ...stored.sealed, meta: other.sealed.meta } })).locked, true);
});

test('bytes that aren’t the ones the uploader signed don’t open', async () => {
  const { stored } = await attach('offer.txt', 'Offer: 120k');
  // someone who once held the file's key encrypts other bytes of the same size under it
  const fileKey = await fileKeyWrap.unwrap(key.key, key.id, stored.sealed.id, stored.sealed.key);
  const forged = await fileCipher.seal(fileKey, stored.sealed.seal, stored.sealed.id, 'bytes', utf8ToBytes('Offer: 999k'));
  await assert.rejects(fileSeal.decrypt(task, stored.sealed, forged), /couldn’t be decrypted and checked/);
});

test('a file from before signed details still opens, marked as the older format', async () => {
  const fileKey = crypto.getRandomValues(new Uint8Array(32));
  const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
  const meta = await fileCipher.seal(fileKey, key.id, id, 'meta', utf8ToBytes(JSON.stringify({ name: 'old.pdf', type: 'application/pdf' })));
  const sealed = { id, seal: key.id, meta: b64u.encode(meta), key: await fileKeyWrap.wrap(key.key, key.id, id, fileKey) };
  const opened = await fileSeal.open(task, { id: 'a-old', taskId: 't1', uploaderId: 'w', filename: 'file', mime: 'application/octet-stream', size: 100, sealed, createdAt: 1 });
  assert.deepEqual([opened.filename, opened.olderFormat, opened.locked], ['old.pdf', true, false]);
});
