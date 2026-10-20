import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';

// A workspace's storage is its files and its database together. Docs and comments fill a disk as
// surely as attachments do, so they count toward UPLOAD_QUOTA_MB and are paced per person.
const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ids = {};

before(async () => {
  srv = await startServer({ env: { UPLOAD_QUOTA_MB: '4', CONTENT_WRITES_PER_MINUTE: '12', STORAGE_CHECK_SECONDS: '1' } });
  const ownerWallet = wallet();
  ids.owner = (await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  await publishKey(owner, ownerWallet);
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.ana = (await ana.wallet(wallet(), 'invite', { name: 'Ana', inviteToken: inv.data.token })).data.user.id;
  ids.task = (await owner('POST', '/api/tasks', { title: 'Storage' })).data.task.id;
});
after(() => srv.close());

const newDoc = (c, userId, bytes) => c('POST', '/api/docs', { id: blob(16), titleCt: blob(40), bodyCt: blob(bytes), grants: [{ userId, wrappedKey: blob(92) }] });

test('comments are paced per person, and one person meeting the limit leaves others free', async () => {
  for (let i = 0; i < 12; i++) assert.equal((await ana('POST', `/api/tasks/${ids.task}/comments`, { body: `note ${i}` })).status, 200);
  const over = await ana('POST', `/api/tasks/${ids.task}/comments`, { body: 'one more' });
  assert.equal(over.status, 429);
  assert.ok(over.headers.get('retry-after'));
  assert.equal((await owner('POST', `/api/tasks/${ids.task}/comments`, { body: 'mine' })).status, 200);
});

test('docs stop going in once the database fills the workspace’s storage, and deleting still works', async () => {
  const made = [];
  let refused = null;
  for (let i = 0; i < 10 && !refused; i++) {
    const res = await newDoc(owner, ids.owner, 700_000);
    if (res.status === 413) refused = res;
    else {
      assert.equal(res.status, 200, JSON.stringify(res.data));
      made.push(res.data.doc.id);
    }
    // let the cached measurement expire, so the next write sees this one
    await sleep(1100);
  }
  assert.ok(refused, 'a doc was refused before ten 700 KB docs went into a 4 MB workspace');
  assert.match(refused.data.error, /used its 4 MB of storage/);

  // files count against the same storage, so an attachment is refused too
  const file = await owner('POST', `/api/tasks/${ids.task}/attachments`, new Uint8Array(1000), { 'Content-Type': 'text/plain', 'X-Filename': 'a.txt' });
  assert.equal(file.status, 413);

  // reading and deleting stay open, so there's a way out
  assert.equal((await owner('GET', '/api/docs')).status, 200);
  for (const id of made) assert.equal((await owner('DELETE', `/api/docs/${id}`)).status, 200);
});
