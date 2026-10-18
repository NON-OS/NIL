import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import agentCalls from './helpers/agentCalls.js';

// An agent works through its own key and never signs in with a browser. A sign-in reset used to
// give a rogue admin a hidden session as an agent that outlived their removal and the agent's.
let srv;
let sql;
let sessions;
let tokenHash;
const base = () => srv.base;
const owner = client(base);
const { rest } = agentCalls(base);
const ids = {};

// What a raw upgrade to /ws gets back with this cookie: the status line, or "open".
function upgrade(cookie) {
  const ws = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers: { Cookie: cookie, Origin: base() } });
  return new Promise((resolve) => {
    ws.on('open', () => (ws.close(), resolve('open')));
    ws.on('unexpected-response', (req, res) => resolve(res.statusCode));
    ws.on('error', () => {});
  });
}

// A session row as if one had been handed out before agents were kept out of browsers.
function plantSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  sql.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', tokenHash(token), userId, Date.now(), Date.now() + 86_400_000);
  return `nonos=${token}`;
}

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: sessions } = await import('../auth/sessions.js'));
  ({ default: tokenHash } = await import('../auth/tokenHash.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Olga', workspaceName: 'Acme' });
  const made = await owner('POST', '/api/agents', { name: 'Helper', access: 'read', runner: 'external' });
  ids.agent = made.data.agent.id;
  ids.key = made.data.key;
});
after(() => srv.close());

test('a sign-in reset can’t target an agent', async () => {
  const res = await owner('POST', `/api/users/${ids.agent}/sign-in-reset`, {});
  assert.equal(res.status, 400);
  assert.match(res.data.error, /Agents don’t sign in/);
  assert.equal(res.data.token, undefined);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sign_in_resets WHERE user_id = ?', ids.agent).n, 0);
});

test('a session, wallet or personal key an agent got earlier opens nothing', async () => {
  const cookie = plantSession(ids.agent);
  const w = wallet();
  sql.run("INSERT INTO credentials (id, user_id, kind, external_id, label, created_at) VALUES ('planted', ?, 'wallet', ?, 'x', ?)", ids.agent, w.address, Date.now());
  const pat = `nonos_pat_${crypto.randomBytes(32).toString('base64url')}`;
  sql.run("INSERT INTO api_tokens (id, user_id, name, token_hash, scope, created_at) VALUES ('planted', ?, 'x', ?, 'write', ?)", ids.agent, tokenHash(pat), Date.now());

  assert.equal((await client(base, { headers: { Cookie: cookie } })('GET', '/api/bootstrap')).status, 401);
  assert.equal(await upgrade(cookie), 401);
  assert.equal((await client(base).wallet(w, 'login')).status, 404);
  assert.equal((await rest(pat, 'GET', '/tasks')).status, 401);
  // its own agent key keeps working
  assert.equal((await rest(ids.key, 'GET', '/tasks')).status, 200);
  sql.run("DELETE FROM credentials WHERE id = 'planted'");
  sql.run("DELETE FROM api_tokens WHERE id = 'planted'");
});

test('deleting an agent ends any session it has', async () => {
  plantSession(ids.agent);
  assert.equal((await owner('DELETE', `/api/agents/${ids.agent}`)).status, 200);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', ids.agent).n, 0);
  assert.equal((await rest(ids.key, 'GET', '/tasks')).status, 401);
});

test('the live connection’s heartbeat drops a person who lost access, not just an ended session', async () => {
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const mia = client(base);
  const id = (await mia.wallet(wallet(), 'invite', { name: 'Mia', inviteToken: inv.data.token })).data.user.id;
  const ws = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers: { Cookie: mia.cookie(), Origin: base() } });
  await once(ws, 'open');
  ws.close();
  const hash = tokenHash(mia.cookie().split('=')[1]);
  assert.equal(sessions.isLive(hash), true);
  // switched off without going through the route that also ends sessions
  sql.run('UPDATE users SET deactivated = 1 WHERE id = ?', id);
  assert.equal(sessions.isLive(hash), false);
  sql.run('UPDATE users SET deactivated = 0 WHERE id = ?', id);
  assert.equal(sessions.isLive(hash), true);
});
