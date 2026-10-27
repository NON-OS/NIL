import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import cipher from './helpers/cipher.js';
import sealedBlob from './helpers/sealedBlob.js';

// Pictures and files taken out of a doc: each saved version says which blobs it uses, and the
// sweep lets go of one no kept version uses, once it's older than the grace period.
let srv;
let sql;
let sweepBlobs;
const base = () => srv.base;
const ana = client(base);
const ids = {};
const DAY = 24 * 3_600_000;
const later = (days) => Date.now() + days * DAY;
const exists = (id) => Boolean(sql.get('SELECT 1 FROM sealed_blobs WHERE id = ?', id));
const scope = () => ({ kind: 'doc', id: ids.doc });

async function save(blobs) {
  const doc = (await ana('GET', `/api/docs/${ids.doc}`)).data.doc;
  const res = await ana('PUT', `/api/docs/${ids.doc}`, { baseVersion: doc.version, titleCt: cipher(40), bodyCt: cipher(200), ...(blobs === undefined ? {} : { blobs }) });
  assert.equal(res.status, 200);
}

before(async () => {
  srv = await startServer({ env: { DOC_BLOB_GRACE_DAYS: '2', DOC_REVISIONS: '10' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: sweepBlobs } = await import('../services/sweepBlobs.js'));
  const w = wallet();
  ids.ana = (await ana.wallet(w, 'setup', { name: 'Ana', workspaceName: 'Pictures' })).data.user.id;
  await publishKey(ana, w);
  ids.doc = crypto.randomBytes(16).toString('base64url');
  const grants = [{ userId: ids.ana, wrappedKey: cipher(92) }];
  assert.equal((await ana('POST', '/api/docs', { id: ids.doc, titleCt: cipher(40), bodyCt: cipher(100), audience: 'people', grants, blobs: [] })).status, 200);
});
after(() => srv.close());

test('a picture no kept version uses goes after the grace period, never before', async () => {
  const kept = (await sealedBlob.upload(ana, scope(), 500)).id;
  const dropped = (await sealedBlob.upload(ana, scope(), 500)).id;
  // the version that had both pictures moves into history, then every version in history goes
  await save([kept, dropped]);
  await save([kept]);
  sql.run('DELETE FROM doc_revisions WHERE doc_id = ?', ids.doc);
  await sweepBlobs({ now: later(1) });
  assert.ok(exists(dropped), 'still within the grace period');
  await sweepBlobs({ now: later(3) });
  assert.ok(!exists(dropped));
  assert.ok(exists(kept));
});

test('a picture an older version still uses stays for as long as that version does', async () => {
  const old = (await sealedBlob.upload(ana, scope(), 500)).id;
  await save([old]);
  await save([]);
  await sweepBlobs({ now: later(3) });
  assert.ok(exists(old), 'the version before still uses it');
  sql.run('DELETE FROM doc_revisions WHERE doc_id = ?', ids.doc);
  await sweepBlobs({ now: later(3) });
  assert.ok(!exists(old));
});

test('nothing goes while a version never said what it uses, or live changes wait to be folded in', async () => {
  const quiet = (await sealedBlob.upload(ana, scope(), 500)).id;
  await save(undefined);
  await sweepBlobs({ now: later(3) });
  assert.ok(exists(quiet), 'the newest version said nothing');

  await save(['not ok!']);
  await sweepBlobs({ now: later(3) });
  assert.ok(exists(quiet), 'a list that doesn’t parse counts as saying nothing');

  await save([]);
  sql.run('DELETE FROM doc_revisions WHERE doc_id = ?', ids.doc);
  assert.equal((await ana('POST', `/api/docs/${ids.doc}/updates`, { updateCt: cipher(120) })).status, 200);
  await sweepBlobs({ now: later(3) });
  assert.ok(exists(quiet), 'a waiting change could be the one that adds it');
});

test('a picture uploaded after the newest version was saved stays until a version leaves it out', async () => {
  await save([]);
  sql.run('DELETE FROM doc_updates WHERE doc_id = ?', ids.doc);
  sql.run('DELETE FROM doc_revisions WHERE doc_id = ?', ids.doc);
  const fresh = (await sealedBlob.upload(ana, scope(), 500)).id;
  await sweepBlobs({ now: later(3) });
  assert.ok(exists(fresh));
});
