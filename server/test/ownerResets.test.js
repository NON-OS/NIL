import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// One admin on their own must never be able to take over an owner's account: not by removing the
// other admins so nobody is left to approve, not by making a new admin to approve for them, and
// not without the owner hearing about it in time to cancel.
const DAY = 86_400_000;
let srv;
let sql;
let pushPayload;
const base = () => srv.base;
const owner = client(base);
const ids = {};
const people = {};

async function join(role, name) {
  const token = (await owner('POST', '/api/invites', { role })).data.token;
  const who = client(base);
  const res = await who.wallet(wallet(), 'invite', { name, inviteToken: token });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  people[name] = who;
  ids[name] = res.data.user.id;
  return who;
}
const resetOwner = (who, body = {}) => people[who]('POST', `/api/users/${ids.owner}/sign-in-reset`, body);
const settled = (name) => sql.run('UPDATE users SET admin_since = ? WHERE id = ?', Date.now() - 4 * DAY, ids[name]);

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: pushPayload } = await import('../push/pushPayload.js'));
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Olivia', workspaceName: 'Acme' })).data.user.id;
  await join('admin', 'Alice');
  await join('admin', 'Bob');
  await join('member', 'Mia');
  settled('Alice');
  settled('Bob');
});
after(() => srv.close());

test('only an owner can demote, remove or delete an admin', async () => {
  assert.equal((await people.Alice('PATCH', `/api/users/${ids.Bob}`, { role: 'member' })).status, 403);
  assert.equal((await people.Alice('PATCH', `/api/users/${ids.Bob}`, { deactivated: true })).status, 403);
  assert.equal((await people.Alice('DELETE', `/api/users/${ids.Bob}`)).status, 403);
  assert.equal(sql.get('SELECT role, deactivated FROM users WHERE id = ?', ids.Bob).role, 'admin');
  // members are still theirs to manage
  assert.equal((await people.Alice('PATCH', `/api/users/${ids.Mia}`, { role: 'guest', projects: [] })).status, 200);
  assert.equal((await people.Alice('PATCH', `/api/users/${ids.Mia}`, { role: 'member' })).status, 200);
});

test('an admin who just left still counts, so resetting the owner still needs approval', async () => {
  const asked = await resetOwner('Alice');
  assert.equal(asked.data.reset.awaitingApproval, true);
  assert.equal(asked.data.token, undefined);
  assert.equal((await owner('PATCH', `/api/users/${ids.Bob}`, { role: 'member' })).status, 200);
  // the request Bob could have approved is still waiting, and asking again gives no link either
  const again = await resetOwner('Alice', { acknowledged: true });
  assert.equal(again.status, 200);
  assert.equal(again.data.reset.awaitingApproval, true);
  assert.equal(again.data.token, undefined);
  await owner('DELETE', `/api/sign-in-resets/${again.data.reset.id}`);
});

test('a brand-new admin can’t approve, so one admin can’t mint their own second', async () => {
  const sock = await join('admin', 'Sock');
  const asked = await resetOwner('Alice');
  assert.equal(asked.data.reset.awaitingApproval, true);
  const refused = await sock('POST', `/api/sign-in-resets/${asked.data.reset.id}/approve`);
  assert.equal(refused.status, 403);
  assert.match(refused.data.error, /admin who has been one for at least 72 hours/);
  // nor can an established admin right after their own sign-in was reset
  settled('Sock');
  const fresh = (await owner('POST', `/api/users/${ids.Sock}/sign-in-reset`, {})).data.token;
  people.Sock = client(base);
  assert.equal((await people.Sock.wallet(wallet(), 'reset', { resetToken: fresh })).status, 200);
  assert.equal((await people.Sock('POST', `/api/sign-in-resets/${asked.data.reset.id}/approve`)).status, 403);
  sql.run('UPDATE sign_in_resets SET used_at = ? WHERE user_id = ?', Date.now() - 4 * DAY, ids.Sock);
  const approved = await people.Sock('POST', `/api/sign-in-resets/${asked.data.reset.id}/approve`);
  assert.equal(approved.status, 200);
  assert.ok(approved.data.token);
  await owner('DELETE', `/api/sign-in-resets/${asked.data.reset.id}`);
  await owner('PATCH', `/api/users/${ids.Sock}`, { deactivated: true });
});

test('with nobody to approve, the reset waits, everyone is told, and the owner can cancel it', async () => {
  // long enough ago that Bob and Sock no longer count
  sql.run('UPDATE users SET admin_until = ? WHERE id IN (?, ?)', Date.now() - 4 * DAY, ids.Bob, ids.Sock);
  assert.equal((await resetOwner('Alice')).status, 409);
  const asked = await resetOwner('Alice', { acknowledged: true });
  assert.equal(asked.status, 200);
  assert.equal(asked.data.token, undefined);
  const { id, readyAt } = asked.data.reset;
  assert.ok(readyAt > Date.now() + 71 * 3_600_000);

  const told = (await owner('GET', '/api/notifications')).data.find((n) => n.type === 'sign_in_reset');
  assert.equal(told.data.own, true);
  assert.equal(told.data.name, 'Alice');
  assert.equal(told.data.readyAt, readyAt);
  assert.equal((await people.Alice('GET', '/api/notifications')).data.some((n) => n.type === 'sign_in_reset'), false);
  const push = pushPayload({ id: 1, type: told.type, data: told.data, names: false });
  assert.equal(push.title, 'Someone asked to reset your sign-in');
  assert.ok(!JSON.stringify(push).includes('Alice'));

  assert.equal((await people.Alice('POST', `/api/sign-in-resets/${id}/link`)).status, 409);
  assert.equal((await owner('DELETE', `/api/sign-in-resets/${id}`)).status, 200);
  sql.run('UPDATE sign_in_resets SET ready_at = ? WHERE id = ?', Date.now() - 1, id);
  assert.equal((await people.Alice('POST', `/api/sign-in-resets/${id}/link`)).status, 404);
  // the owner was never signed out
  assert.equal((await owner('GET', '/api/bootstrap')).status, 200);
});

test('after the wait, only the admin who asked gets the link', async () => {
  const { id } = (await resetOwner('Alice', { acknowledged: true })).data.reset;
  sql.run('UPDATE sign_in_resets SET ready_at = ? WHERE id = ?', Date.now() - 1, id);
  await join('admin', 'Late');
  assert.equal((await people.Late('POST', `/api/sign-in-resets/${id}/link`)).status, 403);
  const made = await people.Alice('POST', `/api/sign-in-resets/${id}/link`);
  assert.equal(made.status, 200);
  assert.equal((await people.Alice('POST', `/api/sign-in-resets/${id}/link`)).status, 400);
  const back = await client(base).wallet(wallet(), 'reset', { resetToken: made.data.token });
  assert.equal(back.data.user.id, ids.owner);
});
