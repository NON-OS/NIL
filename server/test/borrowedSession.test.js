import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import agentCalls from './helpers/agentCalls.js';

// Someone who has a person's session for a moment (a shared computer, a bad extension) mustn't be
// able to leave a way back in that outlives it: a wallet of their own, or an access key.
const DAY = 86_400_000;
let srv;
let sql;
let tokenHash;
const base = () => srv.base;
const owner = client(base);
const { rest } = agentCalls(base);
let victim;
const victimWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: tokenHash } = await import('../auth/tokenHash.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Olga', workspaceName: 'Acme' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  victim = client(base);
  ids.victim = (await victim.wallet(victimWallet, 'invite', { name: 'Vic', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

const keyFor = (who, body = {}) => who('POST', '/api/me/tokens', { name: 'sync', scope: 'write', days: 30, ...body });

test('the session alone can’t link a wallet or make an access key', async () => {
  const thief = wallet();
  const link = await victim.wallet(thief, 'add');
  assert.equal(link.status, 403);
  assert.match(link.data.error, /Confirm it’s you first/);
  assert.equal((await keyFor(victim)).status, 403);
  assert.equal((await client(base).wallet(thief, 'login')).status, 404);
  assert.equal((await victim('GET', '/api/me/tokens')).data.length, 0);
});

test('only an already linked wallet can confirm, and only for the session it signed in', async () => {
  const other = wallet();
  const refused = await victim.wallet(other, 'confirm');
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /isn’t linked to your account/);
  // a second session of the same person, confirmed, doesn't vouch for the first
  const second = client(base);
  await second.wallet(victimWallet, 'login');
  const confirmed = await second.wallet(victimWallet, 'confirm');
  assert.equal(confirmed.status, 200);
  assert.ok(confirmed.data.until > Date.now());
  assert.equal((await keyFor(victim)).status, 403);
  assert.equal((await keyFor(second)).status, 200);
  // and the confirmation runs out after a few minutes
  sql.run('UPDATE sessions SET confirmed_at = ? WHERE user_id = ?', Date.now() - 6 * 60_000, ids.victim);
  assert.equal((await keyFor(second)).status, 403);
  await second('POST', '/api/auth/logout');
});

test('with a confirmation, linking and making keys work, and every key expires', async () => {
  assert.equal((await victim.wallet(victimWallet, 'confirm')).status, 200);
  assert.equal((await victim.wallet(wallet(), 'add')).status, 200);
  const never = await keyFor(victim, { days: null });
  assert.equal(never.status, 400);
  assert.match(never.data.error, /at most 365 days/);
  assert.equal((await keyFor(victim, { days: 366 })).status, 400);
  const made = await keyFor(victim, { days: 365 });
  assert.equal(made.status, 200);
  assert.equal((await rest(made.data.token, 'GET', '/me')).status, 200);
  for (const key of made.data.tokens) assert.ok(key.expiresAt <= Date.now() + 365 * DAY);

  // a key from before keys had to expire stops once it's older than the limit
  const old = `nonos_pat_${crypto.randomBytes(32).toString('base64url')}`;
  sql.run("INSERT INTO api_tokens (id, user_id, name, token_hash, scope, created_at) VALUES ('old', ?, 'old', ?, 'read', ?)", ids.victim, tokenHash(old), Date.now() - 366 * DAY);
  assert.equal((await rest(old, 'GET', '/me')).status, 401);
  sql.run("UPDATE api_tokens SET created_at = ? WHERE id = 'old'", Date.now() - 10 * DAY);
  assert.equal((await rest(old, 'GET', '/me')).status, 200);
});

test('signing out everywhere can take the access keys with it', async () => {
  const keys = (await victim('GET', '/api/me/tokens')).data;
  assert.ok(keys.length >= 2);
  const kept = client(base);
  await kept.wallet(victimWallet, 'login');
  assert.equal((await kept('POST', '/api/me/sign-out-everywhere', {})).status, 200);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?', ids.victim).n, keys.length);
  victim = client(base);
  await victim.wallet(victimWallet, 'login');
  assert.equal((await victim('POST', '/api/me/sign-out-everywhere', { keys: true })).status, 200);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?', ids.victim).n, 0);
});

test('a sign-in reset ends every access key along with the sessions', async () => {
  victim = client(base);
  await victim.wallet(victimWallet, 'login');
  await victim.wallet(victimWallet, 'confirm');
  const key = (await keyFor(victim)).data.token;
  const link = (await owner('POST', `/api/users/${ids.victim}/sign-in-reset`, {})).data.token;
  assert.equal((await client(base).wallet(wallet(), 'reset', { resetToken: link })).status, 200);
  assert.equal((await rest(key, 'GET', '/me')).status, 401);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?', ids.victim).n, 0);
});
