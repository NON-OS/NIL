import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ids = {};

before(async () => {
  srv = await startServer();
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Jane Doe', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

test('tasks: create, update, recurring completion spawns the next one', async () => {
  const project = await owner('POST', '/api/projects', { name: 'Growth Engine' });
  assert.equal(project.data.project.key, 'GE');
  ids.label = (await owner('POST', '/api/labels', { name: 'bug' })).data.label.id;
  const { task } = (
    await owner('POST', '/api/tasks', {
      title: 'Ship weekly newsletter',
      projectId: project.data.project.id,
      assigneeId: ids.member,
      dueDate: '2026-01-05',
      recurrence: 'weekly',
      labels: [ids.label],
      checklist: [{ text: 'Draft' }, { text: 'Send' }],
    })
  ).data;
  assert.equal(task.number, 1);
  ids.task = task.id;
  const done = await member('PATCH', `/api/tasks/${task.id}`, { status: 'done', today: '2026-01-14' });
  assert.equal(done.data.task.recurrence, null);
  assert.equal(done.data.spawned.dueDate, '2026-01-19');
  assert.equal(done.data.spawned.checklist.every((i) => !i.done), true);
  assert.equal((await owner('PATCH', `/api/tasks/${task.id}`, { status: 'exploded' })).status, 400);
});

test('finishing a task issues a signed, chained receipt with a hidden title', async () => {
  const a = (await owner('POST', '/api/tasks', { title: 'Ship the pitch deck', assigneeId: ids.member })).data.task;
  const b = (await owner('POST', '/api/tasks', { title: 'Close seed round', assigneeId: ids.member })).data.task;
  await owner('PATCH', `/api/tasks/${a.id}`, { status: 'done' });
  await owner('PATCH', `/api/tasks/${b.id}`, { status: 'done' });
  const mine = await member('GET', '/api/proofs/mine');
  const latest = mine.data.receipts.slice(0, 2);
  const [second, first] = latest;
  const publicKey = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: mine.data.key }, format: 'jwk' });
  for (const r of latest) {
    assert.equal(crypto.verify(null, Buffer.from(r.body), publicKey, Buffer.from(r.signature, 'base64url')), true);
    assert.equal(JSON.parse(r.body).task.commit, crypto.createHash('sha256').update(`${r.salt}:${r.title}`).digest('hex'));
    assert.equal(r.body.includes(r.title), false);
  }
  assert.equal(JSON.parse(second.body).prev, crypto.createHash('sha256').update(first.body).digest('hex'));
  const tampered = first.body.replace(/"ref":"[^"]+"/, '"ref":"NON-999"');
  assert.equal(crypto.verify(null, Buffer.from(tampered), publicKey, Buffer.from(first.signature, 'base64url')), false);
  await owner('PATCH', `/api/tasks/${b.id}`, { status: 'in_progress' });
  assert.equal((await member('GET', '/api/proofs/mine')).data.receipts.some((r) => r.id === second.id), false);
});

test('comments notify mentioned people and keep the count in sync', async () => {
  const c = await owner('POST', `/api/tasks/${ids.task}/comments`, { body: 'Nice work @JaneDoe!' });
  assert.equal(c.status, 200);
  assert.ok((await member('GET', '/api/notifications')).data.some((n) => n.type === 'mention' && n.taskId === ids.task));
  assert.equal((await owner('GET', `/api/tasks/${ids.task}/detail`)).data.task.commentCount, 1);
  assert.equal((await member('PATCH', `/api/comments/${c.data.comment.id}`, { body: 'edited' })).status, 403);
});

test('uploads are stored privately and risky types are forced to download', async () => {
  const html = new TextEncoder().encode('<script>alert(1)</script>');
  const up = await owner('POST', `/api/tasks/${ids.task}/attachments`, html, { 'Content-Type': 'text/html', 'X-Filename': encodeURIComponent('../evil.html') });
  assert.equal(up.data.attachment.filename, 'evil.html');
  const get = await owner('GET', `/api/attachments/${up.data.attachment.id}`);
  assert.equal(get.headers.get('content-type'), 'application/octet-stream');
  assert.match(get.headers.get('content-disposition'), /^attachment/);
  assert.equal(fs.statSync(path.join(srv.dataDir, 'uploads', up.data.attachment.id)).mode & 0o777, 0o600);
});

test('deleting a label strips it from tasks; CSV export neutralises formulas', async () => {
  await owner('PATCH', `/api/tasks/${ids.task}`, { title: '=HYPERLINK("http://x")' });
  await owner('DELETE', `/api/labels/${ids.label}`);
  assert.deepEqual((await owner('GET', `/api/tasks/${ids.task}/detail`)).data.task.labels, []);
  assert.match((await owner('GET', '/api/export/tasks.csv')).data, /'=HYPERLINK/);
});

test('soft delete, restore and bulk updates', async () => {
  assert.ok((await owner('DELETE', `/api/tasks/${ids.task}`)).data.task.deletedAt);
  assert.equal((await owner('GET', '/api/bootstrap')).data.tasks.some((t) => t.id === ids.task), false);
  await owner('POST', `/api/tasks/${ids.task}/restore`);
  assert.equal((await owner('POST', '/api/tasks/bulk', { ids: [ids.task], patch: { priority: 4 } })).data.tasks[0].priority, 4);
});
