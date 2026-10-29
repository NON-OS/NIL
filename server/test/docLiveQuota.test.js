import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';

// Live doc changes nobody has folded into a version yet count against their sender's file space,
// so one member can't fill the server's disk a doc at a time.
const chars = (n) => crypto.randomBytes(Math.ceil((n * 3) / 4)).toString('base64url').slice(0, n);
let srv;
const base = () => srv.base;
const owner = client(base);
let me;

async function newDoc() {
  const id = crypto.randomBytes(16).toString('base64url');
  const grants = [{ userId: me, wrappedKey: crypto.randomBytes(92).toString('base64url') }];
  assert.equal((await owner('POST', '/api/docs', { id, titleCt: chars(40), bodyCt: chars(200), audience: 'people', grants })).status, 200);
  return id;
}

before(async () => {
  srv = await startServer({ env: { UPLOAD_QUOTA_PER_MEMBER_MB: '1', DOC_PENDING_MB: '1', DOC_UPDATE_MB_PER_MINUTE: '64' } });
  const w = wallet();
  me = (await owner.wallet(w, 'setup', { name: 'Owner', workspaceName: 'Quota' })).data.user.id;
  await publishKey(owner, w);
});
after(() => srv.close());

test('waiting changes across many docs stop at the sender’s file space, and a version frees it', async () => {
  const docs = [await newDoc(), await newDoc(), await newDoc()];
  const statuses = [];
  for (const doc of docs) for (let i = 0; i < 3; i++) statuses.push((await owner('POST', `/api/docs/${doc}/updates`, { updateCt: chars(200_000) })).status);
  assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.equal(statuses.at(-1), 413, 'past a megabyte waiting, the next change is turned away');
  const usage = (await owner('GET', '/api/folders')).data.usage;
  assert.ok(usage.used >= 1_000_000, 'the file space bar counts them');

  // a saved version folds the first doc's changes in and gives the space back
  const first = (await owner('GET', `/api/docs/${docs[0]}`)).data.doc;
  const through = first.updates.at(-1).seq;
  const saved = await owner('PUT', `/api/docs/${docs[0]}`, { titleCt: chars(40), bodyCt: chars(300), baseVersion: first.version, through });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await owner('POST', `/api/docs/${docs[2]}/updates`, { updateCt: chars(200_000) })).status, 200);
});
