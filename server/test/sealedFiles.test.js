import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed from './helpers/sealed.js';
import cipher from './helpers/cipher.js';
import sealedFile from './helpers/sealedFile.js';

let srv;
let sql;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const ids = {};

// A file whose name and contents must never reach the server while its task is private.
const NAME = 'ring-receipt-atelier-noor.pdf';
const BYTES = new TextEncoder().encode('%PDF-1.7 one platinum ring, size 6, paid in full');
const OPAQUE = { 'Content-Type': 'application/octet-stream' };

const uploads = () => path.join(srv.dataDir, 'uploads');
const stored = (id) => fs.readFileSync(path.join(uploads(), id));
const staged = (id) => fs.readdirSync(uploads()).filter((name) => name.startsWith(`${id}.`));
const detail = async (c, id) => (await c('GET', `/api/tasks/${id}/detail`)).data;
const upload = (c, taskId, body, headers) => c('POST', `/api/tasks/${taskId}/attachments`, new Uint8Array(body), headers);
const sealedUpload = (c, taskId, file, body = crypto.randomBytes(96)) => upload(c, taskId, body, { ...OPAQUE, 'X-Sealed': JSON.stringify(file) });
const download = (c, id) => fetch(`${base()}/api/attachments/${id}`, { headers: { Cookie: c.cookie() } });
const privateTask = async () => (await ana('POST', '/api/tasks', { private: true, sealed: sealed(ids.ana) })).data.task;

// Everything the server keeps that could hold a file's name or bytes: the rows, and every file
// in the upload folder, staged copies included.
function everything() {
  const rows = ['attachments', 'activity', 'notifications', 'tasks', 'comments'].map((table) => sql.all(`SELECT * FROM ${table}`));
  const files = fs.readdirSync(uploads()).map((name) => fs.readFileSync(path.join(uploads(), name)).toString('latin1'));
  return JSON.stringify(rows) + files.join('');
}

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const [who, c] of [['ana', ana], ['ben', ben]]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await c.wallet(wallet(), 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
});
after(() => srv.close());

test('a file on a private task only arrives encrypted, under a name and type that say nothing', async () => {
  const task = await privateTask();
  ids.task = task.id;
  const seal = task.sealed.id;

  assert.equal((await upload(ana, task.id, BYTES, { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent(NAME) })).status, 400);
  assert.equal((await upload(ana, task.id, crypto.randomBytes(96), { ...OPAQUE, 'X-Filename': encodeURIComponent(NAME), 'X-Sealed': JSON.stringify(sealedFile(seal)) })).status, 400);
  assert.equal((await upload(ana, task.id, crypto.randomBytes(96), { 'Content-Type': 'application/pdf', 'X-Sealed': JSON.stringify(sealedFile(seal)) })).status, 400);
  for (const bad of ['not json', JSON.stringify({ ...sealedFile(seal), key: cipher(59) }), JSON.stringify({ ...sealedFile(seal), meta: NAME })]) {
    assert.equal((await upload(ana, task.id, crypto.randomBytes(96), { ...OPAQUE, 'X-Sealed': bad })).status, 400);
  }
  // encrypted under a key the task no longer has, nobody could open it
  assert.equal((await sealedUpload(ana, task.id, sealedFile(cipher(16)))).status, 409);
  assert.equal((await sealedUpload(owner, task.id, sealedFile(seal))).status, 404);

  const file = sealedFile(seal);
  const body = crypto.randomBytes(BYTES.length + 28);
  const res = await sealedUpload(ana, task.id, file, body);
  assert.equal(res.status, 200);
  const { attachment } = res.data;
  assert.deepEqual(attachment.sealed, file);
  assert.deepEqual([attachment.filename, attachment.mime, attachment.size], ['encrypted', 'application/octet-stream', body.length]);
  assert.deepEqual(stored(attachment.id), body);
  assert.deepEqual((await detail(ana, task.id)).activity.find((a) => a.type === 'attachment').data, {});
  assert.equal((await detail(ana, task.id)).task.attachmentCount, 1);

  const team = (await owner('POST', '/api/tasks', { title: 'Team task' })).data.task;
  assert.equal((await sealedUpload(owner, team.id, sealedFile(cipher(16)))).status, 400);

  // none of the refused uploads left anything behind
  const kept = everything();
  for (const words of [NAME, 'platinum ring']) assert.equal(kept.includes(words), false, words);
});

test('an encrypted file is only ever served as an opaque download', async () => {
  const looksLikePage = new TextEncoder().encode('<html><script>alert(1)</script></html>');
  const { attachment } = (await sealedUpload(ana, ids.task, sealedFile((await detail(ana, ids.task)).task.sealed.id), looksLikePage)).data;
  for (const url of [attachment.id, `${attachment.id}?download`]) {
    const res = await download(ana, url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.equal(res.headers.get('content-disposition'), "attachment; filename*=UTF-8''encrypted");
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), looksLikePage);
  }
  assert.equal((await download(owner, attachment.id)).status, 404);
});

test('a fresh key re-wraps every file key, all or nothing, and leaves the files alone', async () => {
  const files = (await detail(ana, ids.task)).attachments;
  assert.equal(files.length, 2);
  const bytes = files.map((f) => stored(f.id));
  const handOver = (extra) => ana('PATCH', `/api/tasks/${ids.task}`, { assigneeId: ids.ben, sealed: sealed(ids.ana, ids.ben), comments: [], ...extra });

  assert.equal((await handOver({})).status, 409);
  assert.equal((await handOver({ files: [{ id: files[0].id, key: cipher(60) }] })).status, 409);
  assert.equal((await handOver({ files: files.map((f) => ({ id: f.id, key: cipher(40) })) })).status, 400);
  assert.deepEqual((await detail(ana, ids.task)).attachments.map((a) => a.sealed), files.map((f) => f.sealed));

  const rewrapped = files.map((f) => ({ id: f.id, key: cipher(60), meta: cipher(80) }));
  assert.equal((await handOver({ files: rewrapped })).status, 200);
  const now = (await detail(ben, ids.task)).attachments;
  // only the wrapped key changes; the server keeps the file's seal id, origin and sealed name
  assert.deepEqual(now.map((a) => a.sealed), files.map((f, i) => ({ ...f.sealed, key: rewrapped[i].key })));
  assert.deepEqual(now.map((a) => stored(a.id)), bytes);
});

test('sealing a task with plain files swaps in the encrypted copies its browser staged', async () => {
  const task = (await ana('POST', '/api/tasks', { title: 'Plan the proposal' })).data.task;
  ids.sealing = task.id;
  const plain = (await upload(ana, task.id, BYTES, { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent(NAME) })).data.attachment;
  ids.file = plain.id;
  assert.equal(plain.sealed, null);
  assert.ok(JSON.stringify((await detail(ana, task.id)).activity).includes(NAME));

  const seal = sealed(ids.ana);
  const file = sealedFile(seal.id);
  const encrypted = crypto.randomBytes(BYTES.length + 28);
  const makePrivate = (files) => ana('PATCH', `/api/tasks/${task.id}`, { private: true, sealed: seal, files });

  assert.equal((await owner('PUT', `/api/attachments/${plain.id}/content`, new Uint8Array(encrypted))).status, 403);
  assert.equal((await makePrivate([{ id: plain.id, sealed: file }])).status, 409);
  assert.equal((await ana('PUT', `/api/attachments/${plain.id}/content`, new Uint8Array(encrypted))).status, 200);
  // nothing changes until the task does
  assert.deepEqual(new Uint8Array(await (await download(ana, plain.id)).arrayBuffer()), BYTES);
  assert.equal((await makePrivate([])).status, 409);
  assert.equal((await makePrivate([{ id: plain.id, sealed: sealedFile(cipher(16)) }])).status, 400);

  assert.equal((await makePrivate([{ id: plain.id, sealed: file }])).status, 200);
  const [now] = (await detail(ana, task.id)).attachments;
  assert.deepEqual([now.filename, now.mime, now.size, now.sealed], ['encrypted', 'application/octet-stream', encrypted.length, file]);
  assert.deepEqual(stored(plain.id), encrypted);
  assert.deepEqual(staged(plain.id), []);
  const kept = everything();
  for (const words of [NAME, 'platinum ring']) assert.equal(kept.includes(words), false, words);
});

test('opening a task up again swaps its plain files back in', async () => {
  const opened = { private: false, title: 'Plan the proposal', comments: [] };
  assert.equal((await ana('PATCH', `/api/tasks/${ids.sealing}`, { ...opened, files: [{ id: ids.file, filename: NAME, mime: 'application/pdf' }] })).status, 409);
  assert.equal((await ana('PUT', `/api/attachments/${ids.file}/content`, BYTES)).status, 200);
  const res = await ana('PATCH', `/api/tasks/${ids.sealing}`, { ...opened, files: [{ id: ids.file, filename: `../${NAME}`, mime: 'Application/PDF; x=1' }] });
  assert.equal(res.status, 200);

  const [now] = (await detail(owner, ids.sealing)).attachments;
  assert.deepEqual([now.filename, now.mime, now.size, now.sealed], [NAME, 'application/pdf', BYTES.length, null]);
  const served = await download(owner, ids.file);
  assert.equal(served.headers.get('content-type'), 'application/pdf');
  assert.match(served.headers.get('content-disposition'), /^inline/);
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), BYTES);
  assert.deepEqual(staged(ids.file), []);
});

test('staged copies never outlive the change they were staged for', async () => {
  const { default: settleStaged } = await import('../services/settleStaged.js');
  const task = await privateTask();
  const { attachment } = (await sealedUpload(ana, task.id, sealedFile(task.sealed.id))).data;

  // a plain copy for an open-up that never happened is thrown away on request
  assert.equal((await ana('PUT', `/api/attachments/${attachment.id}/content`, BYTES)).status, 200);
  assert.deepEqual(staged(attachment.id), [`${attachment.id}.plain`]);
  assert.equal((await owner('DELETE', `/api/tasks/${task.id}/attachments/staged`)).status, 404);
  assert.equal((await ana('DELETE', `/api/tasks/${task.id}/attachments/staged`)).status, 200);
  assert.deepEqual(staged(attachment.id), []);

  // or by the sweep, once it's too old to be an upload still under way
  await ana('PUT', `/api/attachments/${attachment.id}/content`, BYTES);
  settleStaged({ olderThan: 3_600_000 });
  assert.deepEqual(staged(attachment.id), [`${attachment.id}.plain`]);
  settleStaged();
  assert.deepEqual(staged(attachment.id), []);

  // a copy that already matches its row was committed just before a stop; it's moved into place
  const swapped = crypto.randomBytes(64);
  fs.writeFileSync(path.join(uploads(), `${attachment.id}.sealed`), swapped);
  settleStaged();
  assert.deepEqual(stored(attachment.id), swapped);
  assert.deepEqual(staged(attachment.id), []);

  // and a file that's removed takes its staged copies with it
  await ana('PUT', `/api/attachments/${attachment.id}/content`, BYTES);
  assert.equal((await ana('DELETE', `/api/attachments/${attachment.id}`)).status, 200);
  assert.deepEqual(staged(attachment.id), []);
});
