import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// Erasing must reach the disk: secure_delete zeroes rows in the database file, and the
// write-ahead log is folded in and cut to nothing, so deleted text survives in neither.
let srv;
const base = () => srv.base;
const owner = client(base);
const onDisk = (secret) => ['nonos.db', 'nonos.db-wal'].filter((name) => {
  const file = path.join(srv.dataDir, name);
  return fs.existsSync(file) && fs.readFileSync(file).includes(secret);
});

before(async () => {
  // trash is erased at the next purge instead of after 30 days
  srv = await startServer({ env: { TRASH_DAYS: '0' } });
  await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
});
after(() => srv.close());

test('an erased task and a deleted comment leave nothing in the database or its log', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'TOPSECRET-TASK-merger-with-initech' })).data.task;
  await owner('POST', `/api/tasks/${task.id}/comments`, { body: 'TOPSECRET-COMMENT-price-is-40M' });
  const keep = (await owner('POST', '/api/tasks', { title: 'Ordinary work' })).data.task;
  await owner('POST', `/api/tasks/${keep.id}/comments`, { body: 'TOPSECRET-NOTE-to-delete' });
  assert.deepEqual(onDisk('TOPSECRET-TASK'), ['nonos.db-wal']);

  const note = (await owner('GET', `/api/tasks/${keep.id}/detail`)).data.comments[0];
  assert.equal((await owner('DELETE', `/api/comments/${note.id}`)).status, 200);
  assert.deepEqual(onDisk('TOPSECRET-NOTE'), []);

  assert.equal((await owner('DELETE', `/api/tasks/${task.id}`)).status, 200);
  // changing the privacy settings runs the purge, which erases the trash
  assert.equal((await owner('PATCH', '/api/privacy', { retention: {} })).status, 200);
  assert.equal((await owner('GET', `/api/tasks/${task.id}/detail`)).status, 404);
  assert.deepEqual(onDisk('TOPSECRET-TASK'), []);
  assert.deepEqual(onDisk('TOPSECRET-COMMENT'), []);
});

test('erasing the workspace leaves nothing in the log either', async () => {
  await owner('POST', '/api/tasks', { title: 'TOPSECRET-WIPE-board-pack' });
  assert.equal((await owner('POST', '/api/privacy/wipe', { confirm: 'Acme' })).status, 200);
  assert.deepEqual(onDisk('TOPSECRET-WIPE'), []);
  assert.deepEqual(onDisk('Olivia Owner'), []);
});
