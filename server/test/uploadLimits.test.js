import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import bootProcess from './helpers/bootProcess.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import SETUP_TOKEN from './helpers/setupToken.js';

// Uploads used to be read whole into memory before anything was checked, with only a per-file
// cap, so any guest could send dozens of large files at once to a task they couldn't even see,
// filling the server's memory and then its disk. The server runs in its own process here, so
// its memory is measured apart from the test's.
let srv;
let dataDir;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const guest = client(base);
const busy = client(base);
const ids = {};
const MB = 1024 * 1024;
const ENV = { SETUP_TOKEN, MAX_UPLOAD_MB: '20', UPLOAD_QUOTA_PER_GUEST_MB: '40', UPLOAD_QUOTA_PER_MEMBER_MB: '250', UPLOAD_QUOTA_MB: '400', UPLOADS_PER_HOUR: '60' };
const FILE = (name = 'a.png') => ({ 'Content-Type': 'image/png', 'X-Filename': name });

const upload = (c, taskId, bytes, name) => c('POST', `/api/tasks/${taskId}/attachments`, new Uint8Array(bytes), FILE(name));
const uploadsDir = () => path.join(dataDir, 'uploads');
const storedBytes = () => fs.readdirSync(uploadsDir()).reduce((n, f) => n + fs.statSync(path.join(uploadsDir(), f)).size, 0);
const count = (results) => results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
// the server's resident memory now and at its highest so far, in MB (Linux)
const memory = () => {
  const status = fs.readFileSync(`/proc/${srv.pid}/status`, 'utf8');
  return { now: Number(/VmRSS:\s+(\d+)/.exec(status)[1]) / 1024, peak: Number(/VmHWM:\s+(\d+)/.exec(status)[1]) / 1024 };
};
const measurable = fs.existsSync('/proc/self/status');

// Sends the headers and the first kilobyte of a body that says it's `total` bytes long, then
// waits: a server that checks before it reads answers now, one that reads first never does.
function answerBeforeBody(c, url, total, { method = 'POST', headers = FILE() } = {}) {
  return new Promise((resolve) => {
    const target = new URL(base() + url);
    const req = http.request({ host: target.hostname, port: target.port, path: target.pathname, method, headers: { ...headers, 'X-NONOS': '1', Cookie: c.cookie(), 'Content-Length': total } });
    const timer = setTimeout(() => (req.destroy(), resolve('no answer')), 3000);
    req.on('response', (res) => {
      clearTimeout(timer);
      res.resume();
      req.destroy();
      resolve(res.statusCode);
    });
    req.on('error', () => {});
    req.write(Buffer.alloc(1024));
  });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-test-'));
  srv = await bootProcess({ dataDir, env: ENV });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  ids.shared = (await owner('POST', '/api/projects', { name: 'Shared' })).data.project.id;
  ids.inside = (await owner('POST', '/api/projects', { name: 'Inside' })).data.project.id;
  const guestInvite = await owner('POST', '/api/invites', { role: 'guest', projectIds: [ids.shared] });
  await guest.wallet(wallet(), 'invite', { name: 'Gus Guest', inviteToken: guestInvite.data.token });
  for (const [c, name] of [[member, 'Mia Member'], [busy, 'Bo Busy']]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    await c.wallet(wallet(), 'invite', { name, inviteToken: inv.data.token });
  }
  ids.task = (await guest('POST', '/api/tasks', { title: 'Hero image', projectId: ids.shared })).data.task.id;
  ids.hidden = (await owner('POST', '/api/tasks', { title: 'Board pack', projectId: ids.inside })).data.task.id;
});
after(async () => {
  await srv.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a task the uploader can’t see answers before the body is read, and nothing is stored', async () => {
  assert.equal(await answerBeforeBody(guest, `/api/tasks/${ids.hidden}/attachments`, 15 * MB), 404);
  assert.equal(await answerBeforeBody(guest, `/api/tasks/${ids.task}/attachments`, 25 * MB), 413, 'too large, said up front');
  assert.deepEqual(fs.readdirSync(uploadsDir()), []);
  assert.equal((await guest('GET', '/api/bootstrap')).status, 200);
});

test('forty large uploads at once from a guest stop at the guest’s quota and never pile up in memory', async () => {
  const before = measurable && memory();
  const blob = new Uint8Array(5 * MB - 10);
  const out = await Promise.all(Array.from({ length: 40 }, () => guest('POST', `/api/tasks/${ids.task}/attachments`, blob, FILE())));
  const statuses = count(out);
  assert.ok(statuses[200] >= 1 && statuses[200] <= 8, JSON.stringify(statuses));
  assert.equal(statuses[200] + statuses[413], 40, JSON.stringify(statuses));
  assert.match(out.find((r) => r.status === 413).data.error, /You’ve used the 40 MB of file space you have/);
  assert.ok(storedBytes() <= 40 * MB, `${storedBytes() / MB} MB stored`);
  if (measurable) assert.ok(memory().peak - before.now < 100, `memory peaked ${(memory().peak - before.now).toFixed(0)} MB higher`);
  assert.deepEqual(fs.readdirSync(uploadsDir()).filter((f) => !/^[\w-]+$/.test(f)), [], 'no partial files left behind');
});

test('large files stream to disk instead of memory', async (t) => {
  const task = (await member('POST', '/api/tasks', { title: 'Raw footage', projectId: ids.shared })).data.task.id;
  const before = measurable && memory();
  const blob = new Uint8Array(20 * MB);
  const out = await Promise.all(Array.from({ length: 10 }, () => member('POST', `/api/tasks/${task}/attachments`, blob, FILE('take.mov'))));
  assert.deepEqual(count(out), { 200: 10 });
  if (measurable) {
    const growth = memory().peak - before.now;
    t.diagnostic(`200 MB of uploads: server memory peaked ${growth.toFixed(0)} MB higher`);
    assert.ok(growth < 80, `200 MB of uploads made memory peak ${growth.toFixed(0)} MB higher`);
  }
  const files = (await member('GET', `/api/tasks/${task}/detail`)).data.attachments;
  assert.equal(files.reduce((n, f) => n + f.size, 0), 200 * MB);
});

test('the workspace quota counts everyone’s files', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Archive', projectId: ids.inside })).data.task.id;
  const blob = new Uint8Array(20 * MB);
  const results = [];
  for (let i = 0; i < 12; i++) results.push(await upload(owner, task, blob, 'archive.zip'));
  const refused = results.find((r) => r.status === 413);
  assert.ok(refused, JSON.stringify(count(results)));
  assert.match(refused.data.error, /This workspace has used its 400 MB of storage/);
  assert.ok(storedBytes() <= 400 * MB);
  // removing files makes room again
  const first = results.find((r) => r.status === 200).data.attachment;
  assert.equal((await owner('DELETE', `/api/attachments/${first.id}`)).status, 200);
  assert.equal((await upload(owner, task, new Uint8Array(MB), 'small.zip')).status, 200);
});

test('one person can send only so many files an hour', async () => {
  const task = (await busy('POST', '/api/tasks', { title: 'Receipts', projectId: ids.shared })).data.task.id;
  const statuses = [];
  for (let i = 0; i < 62; i++) statuses.push((await upload(busy, task, Buffer.from('receipt'), `r${i}.txt`)).status);
  assert.deepEqual([statuses.filter((s) => s === 200).length, statuses.slice(60)], [60, [429, 429]]);
  const limited = await upload(busy, task, Buffer.from('one more'), 'late.txt');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  // someone else isn't held up
  assert.equal((await upload(member, task, Buffer.from('mine'), 'mine.txt')).status, 200);
});

test('a staged copy of a file can’t be larger than the file encrypted', async () => {
  const task = (await member('POST', '/api/tasks', { title: 'Contract', projectId: ids.shared })).data.task.id;
  const file = (await upload(member, task, Buffer.alloc(1000, 1), 'contract.pdf')).data.attachment;
  assert.equal(await answerBeforeBody(member, `/api/attachments/${file.id}/content`, 5 * MB, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' } }), 413);
  assert.equal((await guest('PUT', `/api/attachments/${file.id}/content`, new Uint8Array(1028))).status, 403);
  assert.equal((await member('PUT', `/api/attachments/${file.id}/content`, new Uint8Array(1029))).status, 413);
  assert.equal((await member('PUT', `/api/attachments/${file.id}/content`, new Uint8Array(1028))).status, 200);
  assert.ok(fs.existsSync(path.join(uploadsDir(), `${file.id}.sealed`)));
  assert.equal((await member('DELETE', `/api/tasks/${task}/attachments/staged`)).status, 200);
  assert.equal(fs.readdirSync(uploadsDir()).some((f) => f.startsWith(file.id) && f !== file.id), false);
});

test('an upload cut off by a restart is cleared away when the server starts again', async () => {
  const part = path.join(uploadsDir(), 'cutoff123.part');
  await srv.stop();
  fs.writeFileSync(part, 'half a file');
  srv = await bootProcess({ dataDir, env: ENV });
  assert.ok(srv.base, srv.stderr());
  assert.equal(fs.existsSync(part), false);
});
