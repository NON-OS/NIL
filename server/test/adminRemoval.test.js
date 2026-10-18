import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// Invite links and sign-in resets an admin made stop working once they're no longer an admin, so
// someone removed for misbehaving can't leave a way back in behind them.
let srv;
let sql;
const base = () => srv.base;
const owner = client(base);
const ids = {};

async function join(role, name) {
  const token = (await owner('POST', '/api/invites', { role })).data.token;
  const who = client(base);
  const res = await who.wallet(wallet(), 'invite', { name, inviteToken: token });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return { who, id: res.data.user.id };
}

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Olga', workspaceName: 'Acme' })).data.user.id;
  ids.mia = (await join('member', 'Mia')).id;
});
after(() => srv.close());

const useInvite = (token) => client(base).wallet(wallet(), 'invite', { name: 'Newcomer', inviteToken: token });
const useReset = (token) => client(base).wallet(wallet(), 'reset', { resetToken: token });

test('a demoted admin’s invite links stop working, whatever role they were for', async () => {
  const rogue = await join('admin', 'Rogue');
  const adminLink = (await rogue.who('POST', '/api/invites', { role: 'admin', days: 30 })).data.token;
  const memberLink = (await rogue.who('POST', '/api/invites', { role: 'member', days: 30 })).data.token;
  assert.equal((await owner('PATCH', `/api/users/${rogue.id}`, { role: 'member' })).status, 200);
  for (const token of [adminLink, memberLink]) {
    const res = await useInvite(token);
    assert.equal(res.status, 400);
    assert.match(res.data.error, /invite link has expired or was already used/);
  }
  assert.equal((await (await fetch(`${base()}/api/auth/invite/${adminLink}`)).json()).valid, false);
  // the owner still sees nothing waiting from them
  assert.equal((await owner('GET', '/api/invites')).data.some((i) => i.createdBy === rogue.id && i.live), false);
});

test('removing an admin’s access ends their invite links too', async () => {
  const rogue = await join('admin', 'Rogue Two');
  const link = (await rogue.who('POST', '/api/invites', { role: 'admin', days: 30 })).data.token;
  assert.equal((await owner('PATCH', `/api/users/${rogue.id}`, { deactivated: true })).status, 200);
  assert.equal((await useInvite(link)).status, 400);
});

test('an admin invite is refused once its maker isn’t an admin, even if revoking it was missed', async () => {
  const maker = await join('admin', 'Maker');
  const adminLink = (await maker.who('POST', '/api/invites', { role: 'admin' })).data.token;
  const memberLink = (await maker.who('POST', '/api/invites', { role: 'member' })).data.token;
  // changed underneath the routes, which would have revoked the links
  sql.run("UPDATE users SET role = 'member' WHERE id = ?", maker.id);
  assert.equal((await useInvite(adminLink)).status, 400);
  // a member link from someone who's still on the team keeps working
  assert.equal((await useInvite(memberLink)).status, 200);
  const later = (await owner('POST', '/api/invites', { role: 'member' })).data.token;
  sql.run("UPDATE invites SET created_by = ? WHERE created_by = ? AND uses = 0", maker.id, ids.owner);
  sql.run('UPDATE users SET deactivated = 1 WHERE id = ?', maker.id);
  assert.equal((await useInvite(later)).status, 400);
});

test('reset links an admin asked for or approved stop working when they leave', async () => {
  const asker = await join('admin', 'Asker');
  const link = (await asker.who('POST', `/api/users/${ids.mia}/sign-in-reset`, {})).data.token;
  assert.ok(link);
  assert.equal((await owner('PATCH', `/api/users/${asker.id}`, { role: 'member' })).status, 200);
  assert.equal((await useReset(link)).status, 400);
  assert.equal((await (await fetch(`${base()}/api/auth/reset/${link}`)).json()).valid, false);
  const log = (await owner('GET', '/api/sign-in-resets')).data.log;
  assert.equal(log[0].action, 'reset.cancelled');
  assert.equal(log[0].data.adminLeft, true);
  assert.equal(log[0].subjectId, ids.mia);

  // and one whose asker lost the role without the route noticing is refused when used
  const other = await join('admin', 'Other');
  const second = (await other.who('POST', `/api/users/${ids.mia}/sign-in-reset`, {})).data.token;
  sql.run('UPDATE users SET deactivated = 1 WHERE id = ?', other.id);
  assert.equal((await useReset(second)).status, 400);
  sql.run('UPDATE users SET deactivated = 0 WHERE id = ?', other.id);
  assert.equal((await useReset(second)).status, 200);
});
