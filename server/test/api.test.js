import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-test-'));
process.env.DATA_DIR = dataDir;

let server;
let base;

// A minimal browser stand-in: keeps its own cookie and sends the CSRF header.
function client() {
  let cookie = '';
  return async function call(method, url, body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      headers: {
        'X-NONOS': '1',
        ...(body !== undefined && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body instanceof Uint8Array ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, headers: res.headers };
  };
}

const owner = client();
const member = client();
const stranger = client();
const PASSWORD = 'correct horse battery';

before(async () => {
  const { default: migrate } = await import('../db/migrate.js');
  const { default: createApp } = await import('../app.js');
  migrate();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let ids = {};

test('first visit asks for setup, rejects weak passwords, then creates the owner', async () => {
  const state = await stranger('GET', '/api/auth/state');
  assert.equal(state.data.needsSetup, true);

  const weak = await owner('POST', '/api/auth/setup', { workspaceName: 'NONOS', name: 'Erik Lind', email: 'erik@nonos.test', password: 'password' });
  assert.equal(weak.status, 400);

  const ok = await owner('POST', '/api/auth/setup', { workspaceName: 'NONOS', name: 'Erik Lind', email: 'erik@nonos.test', password: PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'owner');
  ids.owner = ok.data.user.id;

  const again = await stranger('POST', '/api/auth/setup', { workspaceName: 'X', name: 'Mallory', email: 'm@x.test', password: PASSWORD });
  assert.equal(again.status, 409);
});

test('requests without the CSRF header or from another origin are refused', async () => {
  const res = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  const cross = await owner('POST', '/api/projects', { name: 'X' }, { Origin: 'https://evil.example' });
  assert.equal(cross.status, 403);
});

test('wrong password and unknown email give the same answer', async () => {
  const a = await stranger('POST', '/api/auth/login', { email: 'erik@nonos.test', password: 'nope nope nope' });
  const b = await stranger('POST', '/api/auth/login', { email: 'ghost@nonos.test', password: 'nope nope nope' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.data.error, b.data.error);
});

test('invites are single-use and members never see other people’s emails', async () => {
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  assert.equal(inv.status, 200);
  const preview = await member('GET', `/api/auth/invite/${inv.data.token}`);
  assert.equal(preview.data.valid, true);

  const joined = await member('POST', '/api/auth/accept-invite', { token: inv.data.token, name: 'Jane Doe', email: 'jane@nonos.test', password: PASSWORD });
  assert.equal(joined.status, 200);
  ids.member = joined.data.user.id;

  const reuse = await stranger('POST', '/api/auth/accept-invite', { token: inv.data.token, name: 'Bob', email: 'bob@nonos.test', password: PASSWORD });
  assert.equal(reuse.status, 400);

  const seenByMember = await member('GET', '/api/bootstrap');
  const ownerAsSeen = seenByMember.data.users.find((u) => u.id === ids.owner);
  assert.equal(ownerAsSeen.email, null);
  assert.equal(seenByMember.data.me.email, 'jane@nonos.test');

  const seenByOwner = await owner('GET', '/api/bootstrap');
  assert.equal(seenByOwner.data.users.find((u) => u.id === ids.member).email, 'jane@nonos.test');

  const forbidden = await member('POST', '/api/invites', { role: 'admin' });
  assert.equal(forbidden.status, 403);
});

test('tasks: create, update, recurring completion spawns the next one', async () => {
  const project = await owner('POST', '/api/projects', { name: 'Growth Engine' });
  assert.equal(project.data.project.key, 'GE');
  ids.project = project.data.project.id;

  const label = await owner('POST', '/api/labels', { name: 'bug' });
  ids.label = label.data.label.id;

  const created = await owner('POST', '/api/tasks', {
    title: 'Ship weekly newsletter',
    projectId: ids.project,
    assigneeId: ids.member,
    dueDate: '2026-01-05',
    recurrence: 'weekly',
    labels: [ids.label],
    checklist: [{ text: 'Draft' }, { text: 'Send' }],
  });
  assert.equal(created.status, 200);
  const task = created.data.task;
  assert.equal(task.number, 1);
  assert.equal(task.checklist.length, 2);
  ids.task = task.id;

  const done = await member('PATCH', `/api/tasks/${task.id}`, { status: 'done', today: '2026-01-14' });
  assert.equal(done.data.task.status, 'done');
  assert.equal(done.data.task.recurrence, null);
  assert.ok(done.data.task.completedAt);
  assert.equal(done.data.spawned.dueDate, '2026-01-19');
  assert.equal(done.data.spawned.recurrence, 'weekly');
  assert.equal(done.data.spawned.checklist.every((i) => !i.done), true);

  const invalid = await owner('PATCH', `/api/tasks/${task.id}`, { status: 'exploded' });
  assert.equal(invalid.status, 400);
});

test('comments notify mentioned people and keep the count in sync', async () => {
  const c = await owner('POST', `/api/tasks/${ids.task}/comments`, { body: 'Nice work @JaneDoe!' });
  assert.equal(c.status, 200);
  const inbox = await member('GET', '/api/notifications');
  assert.ok(inbox.data.some((n) => n.type === 'mention' && n.taskId === ids.task));
  const detail = await owner('GET', `/api/tasks/${ids.task}/detail`);
  assert.equal(detail.data.comments.length, 1);
  assert.equal(detail.data.task.commentCount, 1);

  const notMine = await member('PATCH', `/api/comments/${c.data.comment.id}`, { body: 'edited' });
  assert.equal(notMine.status, 403);
});

test('uploads are stored privately and risky types are forced to download', async () => {
  const html = new TextEncoder().encode('<script>alert(1)</script>');
  const up = await owner('POST', `/api/tasks/${ids.task}/attachments`, html, { 'Content-Type': 'text/html', 'X-Filename': encodeURIComponent('../evil.html') });
  assert.equal(up.status, 200);
  assert.equal(up.data.attachment.filename, 'evil.html');
  const get = await owner('GET', `/api/attachments/${up.data.attachment.id}`);
  assert.equal(get.headers.get('content-type'), 'application/octet-stream');
  assert.match(get.headers.get('content-disposition'), /^attachment/);
  const mode = fs.statSync(path.join(dataDir, 'uploads', up.data.attachment.id)).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('deleting a label strips it from tasks; CSV export neutralises formulas', async () => {
  await owner('PATCH', `/api/tasks/${ids.task}`, { title: '=HYPERLINK("http://x")' });
  await owner('DELETE', `/api/labels/${ids.label}`);
  const detail = await owner('GET', `/api/tasks/${ids.task}/detail`);
  assert.deepEqual(detail.data.task.labels, []);
  const csv = await owner('GET', '/api/export/tasks.csv');
  assert.match(csv.data, /'=HYPERLINK/);
});

test('soft delete, restore and bulk updates', async () => {
  const del = await owner('DELETE', `/api/tasks/${ids.task}`);
  assert.ok(del.data.task.deletedAt);
  const boot = await owner('GET', '/api/bootstrap');
  assert.equal(boot.data.tasks.some((t) => t.id === ids.task), false);
  await owner('POST', `/api/tasks/${ids.task}/restore`);
  const bulk = await owner('POST', '/api/tasks/bulk', { ids: [ids.task], patch: { priority: 4 } });
  assert.equal(bulk.data.tasks[0].priority, 4);
});

test('admins can revoke access, then erase the account', async () => {
  const early = await owner('DELETE', `/api/users/${ids.member}`);
  assert.equal(early.status, 400);
  await owner('PATCH', `/api/users/${ids.member}`, { deactivated: true });
  const locked = await member('GET', '/api/bootstrap');
  assert.equal(locked.status, 401);
  const erased = await owner('DELETE', `/api/users/${ids.member}`);
  assert.equal(erased.status, 200);
  const boot = await owner('GET', '/api/bootstrap');
  assert.equal(boot.data.users.some((u) => u.id === ids.member), false);
});

test('security headers are present on every response', async () => {
  const res = await fetch(`${base}/healthz`);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});
