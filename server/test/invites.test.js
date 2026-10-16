import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const DAY = 86_400_000;
let srv;
let sql;
let purge;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ids = {};

const join = (token, name) => client(base).wallet(wallet(), 'invite', { name, inviteToken: token });
const listed = async (id) => (await owner('GET', '/api/invites')).data.find((i) => i.id === id);
const valid = async (token) => (await client(base)('GET', `/api/auth/invite/${token}`)).data.valid;

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: purge } = await import('../jobs/purge.js'));
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'Garden club' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mia Member', inviteToken: inv.data.token })).data.user.id;
  ids.beds = (await owner('POST', '/api/projects', { name: 'Raised beds' })).data.project.id;
});
after(() => srv.close());

test('only admins make reusable links, never for admins, and limits are checked', async () => {
  await owner('PUT', '/api/sharing', { invitePolicy: 'members' });
  assert.equal((await member('POST', '/api/invites', { role: 'member', reusable: true })).status, 403);
  assert.equal((await owner('POST', '/api/invites', { role: 'admin', reusable: true })).status, 400);
  for (const maxUses of [1, 0, 1001, 2.5, 'lots']) {
    assert.equal((await owner('POST', '/api/invites', { role: 'member', reusable: true, maxUses })).status, 400, String(maxUses));
  }
  await owner('PUT', '/api/sharing', { invitePolicy: 'admins' });
});

test('a reusable link with a limit lets that many people in, and admins see who', async () => {
  const made = await owner('POST', '/api/invites', { role: 'member', reusable: true, maxUses: 2, days: 14 });
  assert.equal(made.status, 200);
  assert.equal(made.data.invite.reusable, true);
  assert.equal(made.data.invite.maxUses, 2);
  assert.ok(made.data.invite.expiresAt - Date.now() > 13 * DAY);

  // two people race for the last use: exactly one gets it
  const first = await join(made.data.token, 'Ana');
  assert.equal(first.status, 200);
  const race = await Promise.all([join(made.data.token, 'Ben'), join(made.data.token, 'Cleo')]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 400]);
  assert.equal(await valid(made.data.token), false);
  assert.equal((await join(made.data.token, 'Dan')).status, 400);

  const link = await listed(made.data.invite.id);
  assert.equal(link.uses, 2);
  assert.equal(link.live, false);
  const winner = race.find((r) => r.status === 200).data.user.id;
  assert.deepEqual(link.joined.map((j) => j.userId), [first.data.user.id, winner]);
});

test('a reusable link without a limit works until it is revoked, and keeps its history', async () => {
  const made = await owner('POST', '/api/invites', { role: 'guest', projectIds: [ids.beds], reusable: true });
  assert.equal(made.data.invite.maxUses, null);
  const joined = [];
  for (const name of ['Gus', 'Gia', 'Gil']) {
    const res = await join(made.data.token, name);
    assert.equal(res.status, 200);
    assert.equal(res.data.user.role, 'guest');
    joined.push(res.data.user.id);
  }
  assert.equal(await valid(made.data.token), true);

  assert.equal((await owner('DELETE', `/api/invites/${made.data.invite.id}`)).status, 200);
  assert.equal(await valid(made.data.token), false);
  assert.equal((await join(made.data.token, 'Late')).status, 400);
  const link = await listed(made.data.invite.id);
  assert.ok(link.revokedAt);
  assert.deepEqual(link.joined.map((j) => j.userId), joined);
});

test('single-use links still work once, and an unused one disappears when revoked', async () => {
  const once = await owner('POST', '/api/invites', { role: 'member' });
  assert.equal(once.data.invite.reusable, false);
  assert.equal((await join(once.data.token, 'Eve')).status, 200);
  assert.equal((await join(once.data.token, 'Eve again')).status, 400);
  assert.equal((await listed(once.data.invite.id)).joined.length, 1);

  const unused = await owner('POST', '/api/invites', { role: 'member' });
  await owner('DELETE', `/api/invites/${unused.data.invite.id}`);
  assert.equal(await listed(unused.data.invite.id), undefined);
  assert.equal(sql.get('SELECT 1 FROM invites WHERE token_hash = ?', unused.data.invite.id), undefined);
});

test('members see only their own live links, without who joined', async () => {
  await owner('PUT', '/api/sharing', { invitePolicy: 'members' });
  const mine = await member('POST', '/api/invites', { role: 'member' });
  const list = (await member('GET', '/api/invites')).data;
  assert.deepEqual(list.map((i) => i.id), [mine.data.invite.id]);
  assert.deepEqual(list[0].joined, []);
  await owner('PUT', '/api/sharing', { invitePolicy: 'admins' });
});

test('expired links stop working; their history is swept after a while', async () => {
  const made = await owner('POST', '/api/invites', { role: 'member', reusable: true, maxUses: 5 });
  assert.equal((await join(made.data.token, 'Fay')).status, 200);
  sql.run('UPDATE invites SET expires_at = ? WHERE token_hash = ?', Date.now() - 1000, made.data.invite.id);
  assert.equal((await join(made.data.token, 'Fred')).status, 400);
  assert.equal((await listed(made.data.invite.id)).live, false);

  const unusedExpired = await owner('POST', '/api/invites', { role: 'member', reusable: true });
  sql.run('UPDATE invites SET expires_at = ? WHERE token_hash = ?', Date.now() - 1000, unusedExpired.data.invite.id);
  purge();
  assert.equal(sql.get('SELECT 1 FROM invites WHERE token_hash = ?', unusedExpired.data.invite.id), undefined);
  assert.ok(await listed(made.data.invite.id), 'a link people joined through is kept for a while');

  sql.run('UPDATE invites SET expires_at = ? WHERE token_hash = ?', Date.now() - 31 * DAY, made.data.invite.id);
  purge();
  assert.equal(await listed(made.data.invite.id), undefined);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM invite_joins WHERE invite_hash = ?', made.data.invite.id).n, 0);
  // the people stay; only the record of the link goes
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM users WHERE name = 'Fay'").n, 1);
});
