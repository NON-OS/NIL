import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// Applying for a public bounty takes nothing but a wallet, and wallets are free. One person used
// to be able to file a hundred applications from a script, notify every admin a hundred times
// and lock the bounty for good, since declined applications still counted toward its cap.
let srv;
let sql;
const base = () => srv.base;
const owner = client(base);
const admin = client(base);
const member = client(base);
const ids = {};
const USDC = (n) => (BigInt(n) * 10n ** 6n).toString();
const HOUR = 3_600_000;
let ip = 0;

async function challenge(w, taskId, name = 'Spam') {
  const headers = { 'Content-Type': 'application/json', 'X-NONOS': '1', 'X-Forwarded-For': `203.0.113.${(ip += 1) % 250}` };
  const res = await fetch(`${base()}/api/public/bounties/${taskId}/challenge`, { method: 'POST', headers, body: JSON.stringify({ address: w.address, name, pitch: 'buy cheap pills at example.invalid' }) });
  return { status: res.status, headers: res.headers, data: await res.json(), send: headers };
}

async function apply(w, taskId, name) {
  const c = await challenge(w, taskId, name);
  if (c.status !== 200) return c;
  const res = await fetch(`${base()}/api/public/bounties/${taskId}/apply`, { method: 'POST', headers: c.send, body: JSON.stringify({ challengeId: c.data.challengeId, signature: w.sign(c.data.message) }) });
  return { status: res.status, headers: res.headers, data: await res.json(), message: c.data.message };
}

async function listedBounty(title) {
  const id = (await owner('POST', '/api/tasks', { title, projectId: ids.project, bounty: USDC(300), bountyToken: 'USDC' })).data.task.id;
  assert.equal((await owner('PATCH', `/api/tasks/${id}`, { listed: true })).status, 200);
  return id;
}

const board = async () => (await fetch(`${base()}/api/public/bounties`)).json();
const applicationsFor = async (taskId) => (await owner('GET', `/api/tasks/${taskId}/applications`)).data;
const unreadApplications = (userId, taskId) => sql.all("SELECT data FROM notifications WHERE user_id = ? AND task_id = ? AND type = 'application' AND read_at IS NULL", userId, taskId).map((r) => JSON.parse(r.data));

before(async () => {
  srv = await startServer({ env: { TRUST_PROXY: 'loopback', BOUNTY_APPLICATIONS_PER_HOUR: '5', BOUNTY_MAX_PENDING_APPLICATIONS: '8' } });
  sql = (await import('../db/sql.js')).default;
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  const adminInvite = await owner('POST', '/api/invites', { role: 'admin' });
  ids.admin = (await admin.wallet(wallet(), 'invite', { name: 'Ada Admin', inviteToken: adminInvite.data.token })).data.user.id;
  const memberInvite = await owner('POST', '/api/invites', { role: 'member' });
  await member.wallet(wallet(), 'invite', { name: 'Mia Member', inviteToken: memberInvite.data.token });
  ids.project = (await owner('POST', '/api/projects', { name: 'Docs' })).data.project.id;
});
after(() => srv.close());

test('a burst of applications is held to a few an hour, and declining them lets real applicants in', async () => {
  const id = await listedBounty('Translate docs');
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await apply(wallet(), id)).status);
  assert.deepEqual(statuses, [...Array(5).fill(200), ...Array(7).fill(429)]);
  const limited = await challenge(wallet(), id, 'Real Translator');
  assert.equal(limited.status, 429, 'refused before the applicant signs anything');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);

  for (const a of await applicationsFor(id)) assert.equal((await owner('POST', `/api/applications/${a.id}/decline`)).status, 200);
  const legit = await apply(wallet(), id, 'Real Translator');
  assert.equal(legit.status, 200, JSON.stringify(legit.data));
  assert.equal((await board()).items.find((b) => b.id === id).applicants, 1);
});

test('only applications still waiting count toward the cap', async () => {
  const id = await listedBounty('Record the screencasts');
  // eight left waiting from earlier in the day: the cap, but outside the hourly window
  for (let i = 0; i < 8; i++) {
    sql.run('INSERT INTO applications (id, task_id, address, name, pitch, created_at) VALUES (?, ?, ?, ?, ?, ?)', `old-${i}`, id, wallet().address.toLowerCase(), 'Earlier', '', Date.now() - 3 * HOUR);
  }
  const full = await apply(wallet(), id, 'Real Translator');
  assert.equal(full.status, 409);
  assert.match(full.data.error, /as many applications waiting/);

  for (const a of await applicationsFor(id)) await owner('POST', `/api/applications/${a.id}/decline`);
  assert.equal((await apply(wallet(), id, 'Real Translator')).status, 200);
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM applications WHERE task_id = ? AND status = 'declined'", id).n, 8);
});

test('applications for one bounty add up in one unread notification per admin', async () => {
  const id = await listedBounty('Design the badge');
  for (let i = 0; i < 4; i++) assert.equal((await apply(wallet(), id, `Applicant ${i}`)).status, 200);
  for (const userId of [ids.owner, ids.admin]) {
    const unread = unreadApplications(userId, id);
    assert.equal(unread.length, 1, 'one line in the inbox, not four');
    assert.deepEqual([unread[0].count, unread[0].name], [4, 'Applicant 3']);
  }
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM notifications WHERE type = 'application' AND task_id = ?", id).n, 2);

  // once it's read, the next application starts a new one
  const seen = (await admin('GET', '/api/notifications')).data.find((n) => n.type === 'application' && n.taskId === id);
  await admin('POST', '/api/notifications/read', { ids: [seen.id] });
  await apply(wallet(), id, 'Late applicant');
  assert.deepEqual(unreadApplications(ids.admin, id).map((d) => d.count), [1]);
  assert.deepEqual(unreadApplications(ids.owner, id).map((d) => d.count), [5]);
});

test('admins delete an application without a trace, and only admins can', async () => {
  const id = await listedBounty('Fix the typo hunt');
  const spammer = wallet();
  await apply(spammer, id, 'Cheap pills');
  const [app] = await applicationsFor(id);
  assert.equal((await member('DELETE', `/api/applications/${app.id}`)).status, 403);
  assert.equal((await owner('DELETE', `/api/applications/${app.id}`)).status, 200);
  assert.equal((await owner('DELETE', `/api/applications/${app.id}`)).status, 404);
  assert.deepEqual(await applicationsFor(id), []);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM applications WHERE address = ?', spammer.address.toLowerCase()).n, 0);
});

test('a bounty can stop taking applications and stay on the board', async () => {
  const id = await listedBounty('Write the migration guide');
  assert.equal((await member('POST', `/api/tasks/${id}/applications/close`)).status, 403);
  const closed = await owner('POST', `/api/tasks/${id}/applications/close`);
  assert.equal(closed.status, 200);
  assert.ok(closed.data.task.applicationsClosedAt);
  const item = (await board()).items.find((b) => b.id === id);
  assert.deepEqual([item.acceptingApplications, item.apply], [false, null]);
  const refused = await apply(wallet(), id, 'Too late');
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /isn’t taking new applications/);

  const reopened = await owner('POST', `/api/tasks/${id}/applications/reopen`);
  assert.equal(reopened.data.task.applicationsClosedAt, null);
  assert.equal((await board()).items.find((b) => b.id === id).acceptingApplications, true);
  assert.equal((await apply(wallet(), id, 'Just in time')).status, 200);
});
