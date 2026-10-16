import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import SETUP_TOKEN from './helpers/setupToken.js';

// Uploads as an attacker sends them: too large, lying about their type, with names that try to
// climb out of the upload folder or break the download headers, and polyglots that are a valid
// image and a script at once. Whatever comes back must never run on the app's origin.
let srv;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ids = {};
const MB = 1024 * 1024;

const upload = (c, body, headers) => c('POST', `/api/tasks/${ids.task}/attachments`, new Uint8Array(Buffer.from(body)), headers);
const download = (id, query = '') => fetch(`${base()}/api/attachments/${id}${query}`, { headers: { Cookie: owner.cookie() } });
const restore = (body, headers) => fetch(`${base()}/api/auth/restore`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/octet-stream', ...headers }, body });

// Every file the server holds: the uploads folder must contain bare ids and nothing else.
const stored = () => fs.readdirSync(path.join(srv.dataDir, 'uploads'));

// A connection the server cuts instead of answering shows up as 'reset'.
const status = (res) => res.then((r) => r.status).catch(() => 'reset');
const passphrase = Buffer.from('a long enough passphrase').toString('base64');
const fresh = {};

before(async () => {
  srv = await startServer({ env: { MAX_UPLOAD_MB: '1', MAX_CAPSULE_MB: '1' } });
  // restores only work on a server nobody has set up yet, so these run first
  fresh.noToken = await status(restore(Buffer.alloc(10), { 'X-Capsule-Passphrase': passphrase }));
  fresh.wrongToken = await status(restore(Buffer.alloc(10), { 'X-Setup-Token': 'wrong', 'X-Capsule-Passphrase': passphrase }));
  fresh.tooLarge = await status(restore(Buffer.alloc(2 * MB), { 'X-Setup-Token': SETUP_TOKEN, 'X-Capsule-Passphrase': passphrase }));
  fresh.junk = await status(restore(Buffer.alloc(1000, 7), { 'X-Setup-Token': SETUP_TOKEN, 'X-Capsule-Passphrase': passphrase }));
  fresh.leftovers = fs.readdirSync(srv.dataDir).filter((f) => f.startsWith('restore-'));

  await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await member.wallet(wallet(), 'invite', { name: 'Mia Member', inviteToken: inv.data.token });
  ids.project = (await owner('POST', '/api/projects', { name: 'Work' })).data.project.id;
  ids.task = (await owner('POST', '/api/tasks', { title: 'Files', projectId: ids.project })).data.task.id;
});
after(() => srv.close());

test('a capsule restore needs the setup token and answers 413 when it is over its size limit', async () => {
  assert.equal(fresh.noToken, 403);
  assert.equal(fresh.wrongToken, 403);
  assert.equal(fresh.tooLarge, 413, 'a capsule over MAX_CAPSULE_MB gets an answer, not a cut connection');
  assert.ok([400, 422].includes(fresh.junk), `a junk capsule answered ${fresh.junk}`);
  // nothing from the failed restores is left in the data folder
  assert.deepEqual(fresh.leftovers, []);
  // once a workspace exists, a restore can't replace it, token or not
  assert.equal(await status(restore(Buffer.alloc(10), { 'X-Setup-Token': SETUP_TOKEN, 'X-Capsule-Passphrase': passphrase })), 409);
});

test('a file over MAX_UPLOAD_MB is refused and leaves nothing behind', async () => {
  const before = stored();
  const res = await upload(owner, Buffer.alloc(MB + 1), { 'Content-Type': 'application/octet-stream', 'X-Filename': 'big.bin' });
  assert.equal(res.status, 413);
  assert.deepEqual(stored(), before);
  const empty = await upload(owner, Buffer.alloc(0), { 'Content-Type': 'text/plain', 'X-Filename': 'empty.txt' });
  assert.equal(empty.status, 400);
});

test('names that climb out of the folder or break headers are stored as plain names', async () => {
  const names = ['../../../../etc/passwd', '..%2F..%2Fnonos.db', '..\\..\\nonos.db', 'a\r\nSet-Cookie: x=1.txt', 'evil"; filename=other.html', '\u0000nul.txt', '%E0%A4%A', `${'n'.repeat(500)}.txt`, '..', '/'];
  for (const name of names) {
    const res = await upload(owner, 'hello', { 'Content-Type': 'text/plain', 'X-Filename': encodeURIComponent(name) });
    assert.equal(res.status, 200, `${JSON.stringify(name)}: ${JSON.stringify(res.data)}`);
    const { id, filename } = res.data.attachment;
    assert.ok(!/[/\\\u0000-\u001f"]/.test(filename) && filename.length <= 200, `stored as ${JSON.stringify(filename)}`);
    const got = await download(id);
    assert.equal(await got.text(), 'hello');
    const disposition = got.headers.get('content-disposition');
    assert.match(disposition, /^attachment; filename\*=UTF-8''[\w%.!~*'()-]+$/, disposition);
    assert.equal(got.headers.get('set-cookie'), null);
  }
  // only bare ids sit in the upload folder, and nothing landed beside the database
  assert.ok(stored().every((f) => /^[\w-]+$/.test(f)), stored().join(', '));
  assert.ok(!fs.existsSync(path.join(srv.dataDir, 'passwd')));
});

test('ids in the path can’t reach files outside the database’s attachments', async () => {
  for (const id of ['..%2Fnonos.db', '..%2F..%2Fsetup-token', '%2e%2e%2fnonos.db', 'uploads', '.', 'x%00']) {
    const res = await download(id);
    assert.equal(res.status, 404, `GET /api/attachments/${id} answered ${res.status}`);
    for (const [method, url] of [['PUT', `/api/attachments/${id}/content`], ['DELETE', `/api/attachments/${id}`]]) {
      const r = await owner(method, url, method === 'PUT' ? new Uint8Array(Buffer.from('x')) : undefined);
      assert.ok([200, 404].includes(r.status), `${method} ${url} answered ${r.status}`);
    }
  }
  assert.ok(fs.existsSync(path.join(srv.dataDir, 'nonos.db')));
});

test('uploads that claim another type never render as a page on the app’s origin', async () => {
  const cases = [
    ['page.html', 'text/html', '<script>alert(document.cookie)</script>'],
    ['image.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
    ['app.js', 'application/javascript', 'alert(1)'],
    ['page.xhtml', 'application/xhtml+xml', '<html xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></html>'],
    ['x.html', 'text/html; charset=utf-7', '+ADw-script+AD4-alert(1)+ADw-/script+AD4-'],
    ['x.png', 'image/png', '<html><script>alert(1)</script></html>'],
    // a GIF that is also valid JavaScript, and a PDF that carries a script
    ['poly.gif', 'image/gif', 'GIF89a/*\x00\x00*/=alert(1)//;'],
    ['poly.pdf', 'application/pdf', '%PDF-1.4\n1 0 obj<</OpenAction<</S/JavaScript/JS(app.alert(1))>>>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'],
    ['x.png', 'IMAGE/PNG; x=<script>', 'not a png'],
  ];
  for (const [name, type, body] of cases) {
    const res = await upload(member, body, { 'Content-Type': type, 'X-Filename': name });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    for (const query of ['', '?download']) {
      const got = await download(res.data.attachment.id, query);
      const served = got.headers.get('content-type');
      const disposition = got.headers.get('content-disposition');
      const inline = disposition.startsWith('inline');
      assert.ok(['image/png', 'image/gif', 'application/pdf', 'application/octet-stream'].includes(served), `${name} served as ${served}`);
      if (inline) assert.ok(served !== 'application/octet-stream' && !query, `${name} inline as ${served}`);
      else assert.equal(served === 'application/octet-stream' || query === '?download', true);
      assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
      const csp = got.headers.get('content-security-policy');
      assert.match(csp, /default-src 'none'/);
      assert.match(csp, /(^|; )sandbox($|;)/);
      assert.doesNotMatch(csp, /script-src/);
      assert.equal(got.headers.get('x-frame-options'), 'DENY');
      assert.equal(await got.text(), body);
    }
  }
});

test('only the uploader or an admin removes a file, and only people who see the task fetch it', async () => {
  const res = await upload(owner, 'owner file', { 'Content-Type': 'text/plain', 'X-Filename': 'mine.txt' });
  const id = res.data.attachment.id;
  assert.equal((await member('DELETE', `/api/attachments/${id}`)).status, 403);
  assert.equal((await member('PUT', `/api/attachments/${id}/content`, new Uint8Array(Buffer.from('swap')))).status, 403);
  assert.equal((await fetch(`${base()}/api/attachments/${id}`)).status, 401);
  assert.equal((await owner('DELETE', `/api/attachments/${id}`)).status, 200);
});
