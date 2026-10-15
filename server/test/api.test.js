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
function client(onCookie) {
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
    if (setCookie) {
      cookie = setCookie.split(';')[0];
      onCookie?.(cookie);
    }
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, headers: res.headers };
  };
}

let ownerCookieValue = '';
const owner = client((c) => (ownerCookieValue = c));
const ownerCookie = async () => ownerCookieValue;
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

test('finishing a task issues a signed, chained, selectively revealable receipt', async () => {
  const crypto = await import('node:crypto');
  const a = (await owner('POST', '/api/tasks', { title: 'Ship the pitch deck', assigneeId: ids.member })).data.task;
  const b = (await owner('POST', '/api/tasks', { title: 'Close seed round', assigneeId: ids.member })).data.task;
  await owner('PATCH', `/api/tasks/${a.id}`, { status: 'done' });
  await owner('PATCH', `/api/tasks/${b.id}`, { status: 'done' });

  const mine = await member('GET', '/api/proofs/mine');
  const [second, first] = mine.data.receipts;
  assert.equal(second.ref.endsWith(String(b.number)), true);
  const publicKey = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: mine.data.key }, format: 'jwk' });
  for (const r of [first, second]) {
    assert.equal(crypto.verify(null, Buffer.from(r.body), publicKey, Buffer.from(r.signature, 'base64url')), true);
    const body = JSON.parse(r.body);
    assert.equal(body.task.commit, crypto.createHash('sha256').update(`${r.salt}:${r.title}`).digest('hex'));
    assert.equal(body.contributor.id, ids.member);
  }
  assert.equal(JSON.parse(second.body).prev, crypto.createHash('sha256').update(first.body).digest('hex'));

  assert.equal(first.body.includes(first.title), false);
  const tampered = first.body.replace(/"ref":"[^"]+"/, '"ref":"NON-999"');
  assert.notEqual(tampered, first.body);
  assert.equal(crypto.verify(null, Buffer.from(tampered), publicKey, Buffer.from(first.signature, 'base64url')), false);

  await owner('PATCH', `/api/tasks/${b.id}`, { status: 'in_progress' });
  const after = await member('GET', '/api/proofs/mine');
  assert.equal(after.data.receipts.some((r) => r.id === second.id), false);

  const publicKeyInfo = await fetch(`${base}/.well-known/nonos-proof-key`).then((r) => r.json());
  assert.equal(publicKeyInfo.key, mine.data.key);
  const ownerSees = await owner('GET', '/api/proofs/mine');
  assert.equal(ownerSees.data.receipts.some((r) => r.id === first.id), false);
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

test('wallet sign-up, wallet login, forged signatures and last-method protection', async () => {
  const { secp256k1 } = await import('@noble/curves/secp256k1');
  const { keccak_256 } = await import('@noble/hashes/sha3');
  const { bytesToHex, utf8ToBytes, concatBytes } = await import('@noble/hashes/utils');
  const key = secp256k1.utils.randomPrivateKey();
  const address = `0x${bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20))}`;
  const sign = (message, privateKey = key) => {
    const body = utf8ToBytes(message);
    const digest = keccak_256(concatBytes(utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`), body));
    const sig = secp256k1.sign(digest, privateKey);
    return `0x${bytesToHex(sig.toCompactRawBytes())}${(sig.recovery + 27).toString(16)}`;
  };

  const anon = client();
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const challenge = await anon('POST', '/api/auth/wallet/challenge', { address, mode: 'invite', name: 'Satoshi', inviteToken: inv.data.token });
  assert.equal(challenge.status, 200);
  assert.match(challenge.data.message, /wants you to sign in with your Ethereum account/);

  const forged = await anon('POST', '/api/auth/wallet/verify', { challengeId: challenge.data.challengeId, signature: sign(challenge.data.message, secp256k1.utils.randomPrivateKey()) });
  assert.equal(forged.status, 401);

  const again = await anon('POST', '/api/auth/wallet/challenge', { address, mode: 'invite', name: 'Satoshi', inviteToken: inv.data.token });
  const joined = await anon('POST', '/api/auth/wallet/verify', { challengeId: again.data.challengeId, signature: sign(again.data.message) });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.user.email, null);

  const replay = await anon('POST', '/api/auth/wallet/verify', { challengeId: again.data.challengeId, signature: sign(again.data.message) });
  assert.equal(replay.status, 400);

  const fresh = client();
  const login = await fresh('POST', '/api/auth/wallet/challenge', { address, mode: 'login' });
  const signedIn = await fresh('POST', '/api/auth/wallet/verify', { challengeId: login.data.challengeId, signature: sign(login.data.message) });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.data.user.name, 'Satoshi');

  const methods = await fresh('GET', '/api/me/credentials');
  assert.equal(methods.data.hasPassword, false);
  assert.equal(methods.data.credentials[0].address, address);
  const lastOne = await fresh('DELETE', `/api/me/credentials/${methods.data.credentials[0].id}`);
  assert.equal(lastOne.status, 400);

  const pw = await fresh('POST', '/api/me/password', { email: 'satoshi@nonos.team', next: 'a long private passphrase' });
  assert.equal(pw.status, 200);
  const removed = await fresh('DELETE', `/api/me/credentials/${methods.data.credentials[0].id}`);
  assert.equal(removed.status, 200);
});

test('passkey ceremonies refuse expired or foreign challenges', async () => {
  const anon = client();
  const options = await anon('POST', '/api/auth/passkey/login/options');
  assert.equal(options.status, 200);
  assert.ok(options.data.options.challenge);
  const bogus = await anon('POST', '/api/auth/passkey/login', { challengeId: 'nope', response: { id: 'x' } });
  assert.equal(bogus.status, 400);
  const unknown = await anon('POST', '/api/auth/passkey/login', { challengeId: options.data.challengeId, response: { id: 'not-registered' } });
  assert.equal(unknown.status, 401);
  const setupTaken = await anon('POST', '/api/auth/passkey/register/options', { mode: 'setup', name: 'Mallory' });
  assert.equal(setupTaken.status, 409);
});

test('encrypted capsule: export, refuse wrong passphrase, restore on a fresh server', async () => {
  const { spawn } = await import('node:child_process');
  const short = await owner('POST', '/api/export/capsule', { passphrase: 'short' });
  assert.equal(short.status, 400);
  const res = await fetch(`${base}/api/export/capsule`, {
    method: 'POST',
    headers: { 'X-NONOS': '1', 'Content-Type': 'application/json', Cookie: await ownerCookie() },
    body: JSON.stringify({ passphrase: 'correct horse capsule staple' }),
  });
  assert.equal(res.status, 200);
  const capsule = new Uint8Array(await res.arrayBuffer());
  assert.equal(Buffer.from(capsule.subarray(0, 8)).toString(), 'NONOSCAP');
  assert.equal(Buffer.from(capsule).includes(Buffer.from('Ship the pitch deck')), false);

  const busy = await owner('POST', '/api/auth/restore', capsule, { 'Content-Type': 'application/octet-stream', 'X-Capsule-Passphrase': Buffer.from('correct horse capsule staple').toString('base64') });
  assert.equal(busy.status, 409);

  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-restore-'));
  const port = 30000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { env: { ...process.env, DATA_DIR: freshDir, PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    const other = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`${other}/healthz`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const restore = (pass) =>
      fetch(`${other}/api/auth/restore`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/octet-stream', 'X-Capsule-Passphrase': Buffer.from(pass).toString('base64') }, body: capsule });
    assert.equal((await restore('wrong passphrase here')).status, 400);
    assert.equal((await restore('correct horse capsule staple')).status, 200);

    const login = await fetch(`${other}/api/auth/login`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'erik@nonos.test', password: PASSWORD }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const boot = await fetch(`${other}/api/bootstrap`, { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.ok(boot.tasks.some((t) => t.title === 'Ship the pitch deck'));
    const keyThere = await fetch(`${other}/.well-known/nonos-proof-key`).then((r) => r.json());
    const keyHere = await fetch(`${base}/.well-known/nonos-proof-key`).then((r) => r.json());
    assert.equal(keyThere.key, keyHere.key);
  } finally {
    child.kill();
    fs.rmSync(freshDir, { recursive: true, force: true });
  }
});

test('zero-state retention erases old finished work but keeps proofs verifiable', async () => {
  const { default: sql } = await import('../db/sql.js');
  const t = (await owner('POST', '/api/tasks', { title: 'Old secret launch plan', assigneeId: ids.owner })).data.task;
  await owner('PATCH', `/api/tasks/${t.id}`, { status: 'done' });
  sql.run('UPDATE tasks SET completed_at = ? WHERE id = ?', Date.now() - 10 * 86_400_000, t.id);

  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const teammate = client();
  await teammate('POST', '/api/auth/accept-invite', { token: inv.data.token, name: 'Ada Member', email: 'ada@nonos.test', password: PASSWORD });
  const memberTry = await teammate('PATCH', '/api/privacy', { retention: { doneDays: 7 } });
  assert.equal(memberTry.status, 403);
  const set = await owner('PATCH', '/api/privacy', { retention: { doneDays: 7, commentDays: 13 } });
  assert.equal(set.data.retention.doneDays, 7);
  assert.equal(set.data.retention.commentDays, 0);

  const boot = await owner('GET', '/api/bootstrap');
  assert.equal(boot.data.tasks.some((x) => x.id === t.id), false);
  const receipt = sql.get('SELECT title, salt, signature FROM receipts WHERE body LIKE ?', `%NON-${t.number}"%`);
  assert.equal(receipt.title, null);
  assert.equal(receipt.salt, null);
  assert.ok(receipt.signature);
  await owner('PATCH', '/api/privacy', { retention: { doneDays: 0 } });
});

test('security headers are present on every response', async () => {
  const res = await fetch(`${base}/healthz`);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('the owner can erase everything, which returns the server to a fresh install', async () => {
  const wrong = await owner('POST', '/api/privacy/wipe', { confirm: 'nonos' });
  assert.equal(wrong.status, 400);
  const wiped = await owner('POST', '/api/privacy/wipe', { confirm: 'NONOS' });
  assert.equal(wiped.status, 200);
  const state = await stranger('GET', '/api/auth/state');
  assert.equal(state.data.needsSetup, true);
  const after = await owner('GET', '/api/bootstrap');
  assert.equal(after.status, 401);
  assert.equal(fs.readdirSync(path.join(dataDir, 'uploads')).length, 0);
});
