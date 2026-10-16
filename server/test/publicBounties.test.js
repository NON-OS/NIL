import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed from './helpers/sealed.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ids = {};
const USDC = (n) => (BigInt(n) * 10n ** 6n).toString();

before(async () => {
  srv = await startServer();
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await member.wallet(wallet(), 'invite', { name: 'Mia', inviteToken: inv.data.token });
  ids.project = (await owner('POST', '/api/projects', { name: 'Docs site' })).data.project.id;
  ids.listed = (await owner('POST', '/api/tasks', { title: 'Translate the docs to Spanish', description: 'All guides under /docs. '.repeat(60), projectId: ids.project, bounty: USDC(300), bountyToken: 'USDC' })).data.task.id;
  ids.internal = (await owner('POST', '/api/tasks', { title: 'Internal roadmap', projectId: ids.project, bounty: USDC(50), bountyToken: 'USDC' })).data.task.id;
});
after(() => srv.close());

async function apply(w, taskId, name = 'Lucia') {
  const ch = await fetch(`${base()}/api/public/bounties/${taskId}/challenge`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: JSON.stringify({ address: w.address, name, pitch: 'Native speaker, did the Rust book.' }) });
  const c = await ch.json();
  if (ch.status !== 200) return { status: ch.status, data: c };
  const res = await fetch(`${base()}/api/public/bounties/${taskId}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: JSON.stringify({ challengeId: c.challengeId, signature: w.sign(c.message) }) });
  return { status: res.status, data: await res.json(), message: c.message };
}

test('only explicitly listed bounties are public, and only admins list them', async () => {
  assert.equal((await fetch(`${base()}/api/public/bounties`).then((r) => r.json())).items.length, 0);
  assert.equal((await member('PATCH', `/api/tasks/${ids.listed}`, { listed: true })).status, 403);
  const noBounty = (await owner('POST', '/api/tasks', { title: 'Nope' })).data.task;
  assert.equal((await owner('PATCH', `/api/tasks/${noBounty.id}`, { listed: true })).status, 400);
  const priv = (await owner('POST', '/api/tasks', { bounty: USDC(5), bountyToken: 'USDC', private: true, sealed: sealed(ids.owner) })).data.task;
  assert.equal((await owner('PATCH', `/api/tasks/${priv.id}`, { listed: true })).status, 400);

  assert.equal((await owner('PATCH', `/api/tasks/${ids.listed}`, { listed: true })).status, 200);
  const feed = await fetch(`${base()}/.well-known/nonos-bounties.json`);
  assert.equal(feed.headers.get('access-control-allow-origin'), '*');
  const body = await feed.json();
  assert.equal(body.format, 'nonos.bounties');
  assert.equal(body.items.length, 1);
  const item = body.items[0];
  assert.deepEqual([item.title, item.reward.symbol, item.reward.amount], ['Translate the docs to Spanish', 'USDC', USDC(300)]);
  assert.ok(item.summary.length <= 601);
  const text = JSON.stringify(body);
  for (const leak of ['Internal roadmap', 'Docs site', 'Erik', ids.project]) assert.equal(text.includes(leak), false, leak);
});

test('outsiders apply with a wallet signature; no account is created', async () => {
  const lucia = wallet();
  ids.luciaWallet = lucia;
  const res = await apply(lucia, ids.listed);
  assert.equal(res.status, 200);
  assert.match(res.message, /wants you to sign in with your Ethereum account/);
  assert.match(res.message, /Apply for NON-1/);
  assert.equal((await apply(lucia, ids.listed)).status, 409);
  assert.equal((await apply(wallet(), ids.internal)).status, 404);

  const forger = wallet();
  const c = await (await fetch(`${base()}/api/public/bounties/${ids.listed}/challenge`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: JSON.stringify({ address: forger.address, name: 'Mallory' }) })).json();
  const bad = await fetch(`${base()}/api/public/bounties/${ids.listed}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: JSON.stringify({ challengeId: c.challengeId, signature: wallet().sign(c.message) }) });
  assert.equal(bad.status, 401);

  const usersBefore = (await owner('GET', '/api/bootstrap')).data.users.length;
  assert.equal(usersBefore, 2);
  const login = await client(base).wallet(lucia, 'login');
  assert.equal(login.status, 403);
  assert.match(login.data.error, /still waiting for the team/);
  assert.ok((await owner('GET', '/api/notifications')).data.some((n) => n.type === 'application'));
});

test('admins accept an applicant, who then sees only that task', async () => {
  await apply(wallet(), ids.listed, 'Second applicant');
  assert.equal((await member('GET', `/api/tasks/${ids.listed}/applications`)).status, 403);
  const apps = (await owner('GET', `/api/tasks/${ids.listed}/applications`)).data;
  assert.equal(apps.length, 2);
  const lucia = apps.find((a) => a.name === 'Lucia');
  assert.equal(lucia.address, ids.luciaWallet.address.toLowerCase());

  const accepted = await owner('POST', `/api/applications/${lucia.id}/accept`);
  assert.equal(accepted.status, 200);
  assert.ok(accepted.data.task.assigneeId);
  const after = (await owner('GET', `/api/tasks/${ids.listed}/applications`)).data;
  assert.deepEqual(after.map((a) => a.status).sort(), ['accepted', 'closed']);
  assert.equal((await fetch(`${base()}/api/public/bounties`).then((r) => r.json())).items.length, 0);

  const hunter = client(base);
  const signedIn = await hunter.wallet(ids.luciaWallet, 'login');
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.data.user.role, 'guest');
  const boot = (await hunter('GET', '/api/bootstrap')).data;
  assert.deepEqual(boot.tasks.map((t) => t.title), ['Translate the docs to Spanish']);
  assert.equal(boot.projects.length, 0);
  assert.equal((await hunter('GET', `/api/tasks/${ids.internal}/detail`)).status, 404);
  assert.equal((await hunter('POST', `/api/tasks/${ids.listed}/comments`, { body: 'Starting today' })).status, 200);
});

test('assigning or hiding a listed task takes it off the board', async () => {
  const t = (await owner('POST', '/api/tasks', { title: 'Logo refresh', bounty: USDC(80), bountyToken: 'USDC' })).data.task;
  await owner('PATCH', `/api/tasks/${t.id}`, { listed: true });
  assert.equal((await fetch(`${base()}/api/public/bounties`).then((r) => r.json())).items.length, 1);
  await owner('PATCH', `/api/tasks/${t.id}`, { private: true, sealed: sealed(ids.owner) });
  assert.equal((await fetch(`${base()}/api/public/bounties`).then((r) => r.json())).items.length, 0);
  assert.equal((await owner('GET', `/api/tasks/${t.id}/detail`)).data.task.listedAt, null);
});
