import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import sealedBlob from './helpers/sealedBlob.js';
import sharedFolder from './helpers/sharedFolder.js';

// What nobody can open any more: docs and folders whose last key holder is gone, and stored
// files no row points at. Neither may stay on the disk for good.
let srv;
let sql;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ids = {};
const chars = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const uploads = () => path.join(srv.dataDir, 'uploads');

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  const wo = wallet();
  ids.wa = wallet();
  ids.owner = (await owner.wallet(wo, 'setup', { name: 'Owner', workspaceName: 'Orphans' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.ana = (await ana.wallet(ids.wa, 'invite', { name: 'Ana', inviteToken: inv.data.token })).data.user.id;
  await publishKey(owner, wo);
  await publishKey(ana, ids.wa);
});
after(() => srv.close());

test('a doc and a folder only Ana could open go, with their files, when she resets her keys', async () => {
  const doc = chars(16);
  assert.equal((await ana('POST', '/api/docs', { id: doc, titleCt: chars(30), bodyCt: chars(100), audience: 'people', grants: [{ userId: ids.ana, wrappedKey: chars(92) }] })).status, 200);
  const shared = chars(16);
  assert.equal((await ana('POST', '/api/docs', { id: shared, titleCt: chars(30), bodyCt: chars(100), audience: 'people', grants: [ids.ana, ids.owner].map((userId) => ({ userId, wrappedKey: chars(92) })) })).status, 200);
  const picture = (await sealedBlob.upload(ana, { kind: 'doc', id: doc }, 500)).id;
  const folder = (await sharedFolder.create(ana, [ids.ana])).id;
  const file = (await sealedBlob.upload(ana, { kind: 'folder', id: folder }, 500)).id;

  await publishKey(ana, ids.wa, { reset: true });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sql.get('SELECT 1 FROM docs WHERE id = ?', doc), undefined);
  assert.equal(sql.get('SELECT 1 FROM folders WHERE id = ?', folder), undefined);
  for (const id of [picture, file]) assert.equal(sql.get('SELECT 1 FROM sealed_blobs WHERE id = ?', id), undefined);
  assert.deepEqual(fs.readdirSync(uploads()).filter((n) => n.startsWith(`${picture}_`) || n.startsWith(`${file}_`)), []);
  // the doc the owner can still open stays
  assert.ok(sql.get('SELECT 1 FROM docs WHERE id = ?', shared));
});

test('stored files no row points at go once they’re older than the grace period', async () => {
  const { default: sweepBlobs } = await import('../services/sweepBlobs.js');
  const strays = ['abcdefghijkl_0', 'chat-abcdefghijkl', 'abcdefghijkl'].map((n) => path.join(uploads(), n));
  for (const f of strays) fs.writeFileSync(f, 'left behind');
  await sweepBlobs();
  assert.ok(strays.every((f) => fs.existsSync(f)), 'still within the grace period');
  await sweepBlobs({ now: Date.now() + 7 * 3_600_000 });
  assert.ok(strays.every((f) => !fs.existsSync(f)));
});
