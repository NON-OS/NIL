import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
let sql;
const base = () => srv.base;
const people = {};
const wallets = {};
const ids = {};

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  people.owner = client(base);
  wallets.owner = wallet();
  ids.owner = (await people.owner.wallet(wallets.owner, 'setup', { name: 'Olga', workspaceName: 'NONOS' })).data.user.id;
  for (const [name, role] of [['ada', 'admin'], ['ben', 'admin'], ['mia', 'member']]) {
    const token = (await people.owner('POST', '/api/invites', { role })).data.token;
    people[name] = client(base);
    wallets[name] = wallet();
    ids[name] = (await people[name].wallet(wallets[name], 'invite', { name, inviteToken: token })).data.user.id;
  }
});
after(() => srv.close());

const resetFor = (who, id, body = {}) => people[who]('POST', `/api/users/${id}/sign-in-reset`, body);
const useLink = (w, token) => client(base).wallet(w, 'reset', { resetToken: token });
const actions = async () => (await people.ada('GET', '/api/sign-in-resets')).data.log.map((e) => e.action);

test('only admins can reset someone’s sign-in or read the log', async () => {
  assert.equal((await resetFor('mia', ids.ada)).status, 403);
  assert.equal((await people.mia('GET', '/api/sign-in-resets')).status, 403);
  assert.equal((await client(base)('POST', `/api/users/${ids.mia}/sign-in-reset`, {})).status, 401);
});

test('a member who lost their wallet gets back into the same account with a new one, once', async () => {
  const task = (await people.mia('POST', '/api/tasks', { title: 'Water the plants', assigneeId: ids.mia })).data.task;
  const res = await resetFor('ada', ids.mia);
  assert.equal(res.status, 200);
  assert.equal(res.data.reset.awaitingApproval, false);
  const { token } = res.data;
  assert.deepEqual(await (await fetch(`${base()}/api/auth/reset/${token}`)).json(), { valid: true, name: 'mia', workspace: { name: 'NONOS', taskPrefix: 'NON' } });

  const fresh = wallet();
  const back = await useLink(fresh, token);
  assert.equal(back.status, 200);
  assert.equal(back.data.user.id, ids.mia);
  assert.equal(back.data.user.role, 'member');
  // the session on the lost device ends
  assert.equal((await people.mia('GET', '/api/bootstrap')).status, 401);
  // the link is spent
  assert.equal((await useLink(wallet(), token)).status, 400);
  assert.equal((await (await fetch(`${base()}/api/auth/reset/${token}`)).json()).valid, false);

  // same account: the task is still theirs, and the old wallet goes once they remove it
  const mia = client(base);
  assert.equal((await mia.wallet(fresh, 'login')).data.user.id, ids.mia);
  const boot = (await mia('GET', '/api/bootstrap')).data;
  assert.equal(boot.tasks.find((t) => t.id === task.id).assigneeId, ids.mia);
  const linked = (await mia('GET', '/api/me/credentials')).data.credentials;
  assert.equal(linked.find((c) => c.address === fresh.address).label, 'Wallet from your sign-in reset');
  const old = linked.find((c) => c.address === wallets.mia.address);
  assert.equal((await mia('DELETE', `/api/me/credentials/${old.id}`)).status, 200);
  assert.equal((await client(base).wallet(wallets.mia, 'login')).status, 404);
  wallets.mia = fresh;
  people.mia = mia;
  assert.deepEqual((await actions()).slice(0, 2), ['wallet.removed', 'reset.used']);
});

test('links expire, and a new link or a cancel ends the old one', async () => {
  const first = (await resetFor('ada', ids.mia)).data.token;
  const second = (await resetFor('ben', ids.mia)).data.token;
  assert.equal((await useLink(wallet(), first)).status, 400);

  sql.run('UPDATE sign_in_resets SET expires_at = ? WHERE expires_at > ?', Date.now() - 1, Date.now());
  assert.equal((await useLink(wallet(), second)).status, 400);

  const third = await resetFor('ada', ids.mia);
  assert.equal((await people.ben('DELETE', `/api/sign-in-resets/${third.data.reset.id}`)).status, 200);
  assert.equal((await useLink(wallet(), third.data.token)).status, 400);
  assert.equal((await people.ben('DELETE', `/api/sign-in-resets/${third.data.reset.id}`)).status, 404);
});

test('a wallet already linked to an account leaves the link usable', async () => {
  const { token } = (await resetFor('ada', ids.mia)).data;
  const taken = await useLink(wallets.owner, token);
  assert.equal(taken.status, 400);
  assert.match(taken.data.error, /already linked/);
  people.mia = client(base);
  assert.equal((await people.mia.wallet(wallet(), 'reset', { resetToken: token })).status, 200);
});

test('nobody resets themselves, someone without access, or someone who doesn’t exist', async () => {
  assert.equal((await resetFor('ada', ids.ada)).status, 400);
  assert.equal((await resetFor('ada', 'nobody')).status, 404);
  const token = (await people.owner('POST', '/api/invites', { role: 'member' })).data.token;
  const gone = (await client(base).wallet(wallet(), 'invite', { name: 'Gil', inviteToken: token })).data.user.id;
  const link = (await resetFor('ada', gone)).data.token;
  await people.ada('PATCH', `/api/users/${gone}`, { deactivated: true });
  assert.equal((await resetFor('ada', gone)).status, 400);
  // a link issued before their access was removed stops working too
  assert.equal((await useLink(wallet(), link)).status, 400);
});

test('with two or more other admins, resetting an owner needs a second admin to approve', async () => {
  const asked = await resetFor('ada', ids.owner);
  assert.equal(asked.status, 200);
  assert.equal(asked.data.reset.awaitingApproval, true);
  assert.equal(asked.data.token, undefined);
  const { id } = asked.data.reset;
  assert.equal((await people.ada('POST', `/api/sign-in-resets/${id}/approve`)).status, 403);
  assert.equal((await people.owner('POST', `/api/sign-in-resets/${id}/approve`)).status, 403);
  assert.equal((await people.mia('POST', `/api/sign-in-resets/${id}/approve`)).status, 403);

  const approved = await people.ben('POST', `/api/sign-in-resets/${id}/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.data.reset.approvedBy, ids.ben);
  assert.equal((await people.ben('POST', `/api/sign-in-resets/${id}/approve`)).status, 400);
  const fresh = wallet();
  const back = await useLink(fresh, approved.data.token);
  assert.equal(back.data.user.id, ids.owner);
  assert.equal(back.data.user.role, 'owner');
  people.owner = client(base);
  await people.owner.wallet(fresh, 'login');
  assert.deepEqual((await actions()).slice(0, 3), ['reset.used', 'reset.approved', 'reset.requested']);
});

test('with only one other admin, resetting an owner goes ahead after a clear warning', async () => {
  await people.ada('PATCH', `/api/users/${ids.ben}`, { deactivated: true });
  const warned = await resetFor('ada', ids.owner);
  assert.equal(warned.status, 409);
  assert.match(warned.data.error, /no other admin to approve/);
  const confirmed = await resetFor('ada', ids.owner, { acknowledged: true });
  assert.equal(confirmed.status, 200);
  assert.ok(confirmed.data.token);
  const log = (await people.ada('GET', '/api/sign-in-resets')).data.log;
  assert.equal(log[0].action, 'reset.issued');
  assert.equal(log[0].data.unapproved, true);
  assert.equal(log[0].actorId, ids.ada);
  assert.equal(log[0].subjectId, ids.owner);
});

test('the log holds who and what, never tokens or wallet addresses', async () => {
  const { resets, log } = (await people.ada('GET', '/api/sign-in-resets')).data;
  assert.ok(resets.some((r) => r.userId === ids.owner));
  const dump = JSON.stringify({ resets, log });
  for (const w of Object.values(wallets)) assert.ok(!dump.includes(w.address.slice(2)));
  assert.ok(!/token/i.test(dump));
});

test('a workspace without a name never asks wallets to sign in to nothing', async () => {
  sql.run("UPDATE workspace SET name = '' WHERE id = 1");
  try {
    const challenge = await client(base)('POST', '/api/auth/wallet/challenge', { address: wallets.ada.address, mode: 'login' });
    assert.match(challenge.data.message, /^Sign in to Nil\.$/m);
  } finally {
    sql.run("UPDATE workspace SET name = 'NONOS' WHERE id = 1");
  }
});
