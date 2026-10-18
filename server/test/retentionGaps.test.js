import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// What the zero-state promise covers beyond tasks, comments and history: rows that have done
// their job, the sign-in audit trail, agents' delivery log, and copies of the database.
let srv;
let sql;
let purge;
let pruneAgentData;
let retention;
const base = () => srv.base;
const owner = client(base);
const ids = {};
const DAY = 86_400_000;
const now = Date.now();
const LONG_AGO = now - 400 * DAY;
// a point on secp256k1, as a one-time payout's ephemeral key is
const POINT = '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

before(async () => {
  srv = await startServer({ env: { EXPIRED_DAYS: '1', UPGRADE_COPY_DAYS: '2', VOTE_POWER_DAYS: '1' } });
  sql = (await import('../db/sql.js')).default;
  purge = (await import('../jobs/purge.js')).default;
  pruneAgentData = (await import('../jobs/pruneAgentData.js')).default;
  retention = (await import('../services/retention.js')).default;
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' })).data.user.id;
  ids.task = (await owner('POST', '/api/tasks', { title: 'Pay the venue' })).data.task.id;
});
after(() => srv.close());

const has = (table, where, ...params) => Boolean(sql.get(`SELECT 1 FROM ${table} WHERE ${where}`, ...params));

test('links, keys, reminders and payments that have done their job are erased', async () => {
  const link = (id, extra) => sql.run(`INSERT INTO share_links (id, token_hash, kind, target_id, created_by, created_at${extra.cols}) VALUES (?, ?, 'task', ?, ?, ?${extra.vals})`, id, `hash-${id}`, ids.task, ids.owner, LONG_AGO, ...extra.params);
  link('link-revoked', { cols: ', revoked_at', vals: ', ?', params: [LONG_AGO] });
  link('link-expired', { cols: ', expires_at', vals: ', ?', params: [LONG_AGO] });
  link('link-live', { cols: ', expires_at', vals: ', ?', params: [now + DAY] });
  for (const [id, used] of [['reset-used', LONG_AGO], ['reset-open', null]]) {
    sql.run('INSERT INTO sign_in_resets (id, user_id, token_hash, requested_by, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, ids.owner, `t-${id}`, ids.owner, LONG_AGO, used ? LONG_AGO : now + DAY, used);
  }
  for (const [id, expires] of [['key-expired', LONG_AGO], ['key-forever', null]]) {
    sql.run("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at, expires_at) VALUES (?, ?, 'Script', ?, ?, ?)", id, ids.owner, `k-${id}`, LONG_AGO, expires);
  }
  sql.run("INSERT INTO reminders (id, user_id, task_id, note, remind_at, sent_at, created_at) VALUES ('sent', ?, ?, 'ask about the deposit', ?, ?, ?)", ids.owner, ids.task, LONG_AGO, LONG_AGO, LONG_AGO);
  sql.run("INSERT INTO reminders (id, user_id, task_id, note, remind_at, created_at) VALUES ('waiting', ?, ?, 'later', ?, ?)", ids.owner, ids.task, now + DAY, now);
  const intent = (id, stealth) =>
    sql.run("INSERT INTO payment_intents (id, task_id, payer_id, payee_id, to_address, token, amount, suffix, grid, start_block, stealth_ephemeral, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'NOX', '1', 7, '1', 1, ?, ?, ?)",
      id, ids.task, ids.owner, ids.owner, `0x${id.padStart(40, '0')}`.slice(0, 42), stealth, LONG_AGO, LONG_AGO);
  intent('plain', null);
  intent('aaaa', POINT);
  intent('bbbb', '0x03aa');
  sql.run("INSERT INTO payments (id, task_id, task_ref, payee_id, to_address, amount, tx_hash, status, intent_id, stealth_ephemeral, created_at) VALUES ('p1', ?, 'ACM-1', ?, ?, '1', '0xtx1', 'confirmed', 'aaaa', ?, ?)", ids.task, ids.owner, `0x${'aaaa'.padStart(40, '0')}`, POINT, LONG_AGO);

  await purge();

  assert.deepEqual(sql.all("SELECT id FROM share_links WHERE id LIKE 'link-%'").map((r) => r.id), ['link-live']);
  assert.deepEqual(sql.all("SELECT id FROM sign_in_resets WHERE id LIKE 'reset-%'").map((r) => r.id), ['reset-open']);
  assert.deepEqual(sql.all("SELECT id FROM api_tokens WHERE id LIKE 'key-%'").map((r) => r.id), ['key-forever']);
  assert.deepEqual(sql.all('SELECT id FROM reminders').map((r) => r.id), ['waiting']);
  // a private payout nobody recorded keeps its one-time address, so it is never handed out again
  assert.deepEqual(sql.all('SELECT id FROM payment_intents').map((r) => r.id), ['bbbb']);
  assert.equal(sql.get("SELECT intent_id FROM payments WHERE id = 'p1'").intent_id, null);

  const { default: privateTarget } = await import('../services/privateTarget.js');
  await assert.rejects(privateTarget({ id: ids.owner, stealth_meta: 'st:eth:0x00' }, { address: `0x${'aaaa'.padStart(40, '0')}`, ephemeralPublicKey: POINT, viewTag: 1 }), /already used for another payout/);
});

test('the sign-in audit trail and the webhook delivery log follow the history policy', async () => {
  sql.run("INSERT INTO sign_in_audit (action, actor_id, subject_id, created_at) VALUES ('wallet.linked', ?, ?, ?)", ids.owner, ids.owner, LONG_AGO);
  sql.run("INSERT INTO sign_in_audit (action, actor_id, subject_id, created_at) VALUES ('wallet.linked', ?, ?, ?)", ids.owner, ids.owner, now);
  const agent = await owner('POST', '/api/agents', { name: 'Ext', color: '#0e9384', access: 'read', allProjects: true, runner: 'external' });
  const agentId = agent.data.agent?.id ?? sql.get("SELECT id FROM users WHERE kind = 'agent'").id;
  sql.run("INSERT INTO webhook_deliveries (id, agent_id, event, payload, status, created_at) VALUES ('d-old', ?, 'task.updated', '{}', 'delivered', ?)", agentId, now - 3 * DAY);
  await purge();
  await pruneAgentData();
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM sign_in_audit WHERE created_at < ?", now - DAY).n, 1, 'kept while no history policy is set');
  assert.ok(has('webhook_deliveries', "id = 'd-old'"), 'kept for AGENT_WEBHOOK_LOG_DAYS without a policy');

  retention.set({ activityDays: 1 });
  await purge();
  await pruneAgentData();
  retention.set({ activityDays: 0 });
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sign_in_audit WHERE created_at < ?', now - DAY).n, 0);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sign_in_audit').n > 0, true, 'recent entries stay');
  assert.equal(has('webhook_deliveries', "id = 'd-old'"), false);
});

test('a closed vote keeps the voting power its ballots were counted with, and only that', async () => {
  const proposal = (id, closedAt, result) =>
    sql.run("INSERT INTO proposals (id, title, options, weighting, created_at, closes_at, closed_at, result) VALUES (?, 'Budget', '[\"Yes\",\"No\"]', 'power', ?, ?, ?, ?)", id, LONG_AGO, LONG_AGO, closedAt, result);
  proposal('closed-long-ago', LONG_AGO, '{}');
  proposal('still-open', null, null);
  proposal('encrypted-undecided', LONG_AGO, null);
  const other = (await owner('POST', '/api/invites', { role: 'member' })).data.token;
  const member = client(base);
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mo Member', inviteToken: other })).data.user.id;
  for (const p of ['closed-long-ago', 'still-open', 'encrypted-undecided']) {
    for (const u of [ids.owner, ids.member]) sql.run("INSERT INTO proposal_power (proposal_id, user_id, nox, staked, zsp, power) VALUES (?, ?, '5', '0', 0, '5')", p, u);
  }
  sql.run("INSERT INTO votes (proposal_id, user_id, choice, weight, address, message, signature, created_at) VALUES ('closed-long-ago', ?, 0, '5', '0x1', 'm', 's', ?)", ids.owner, LONG_AGO);
  await purge();
  const left = (p) => sql.all('SELECT user_id FROM proposal_power WHERE proposal_id = ? ORDER BY user_id', p).map((r) => r.user_id);
  assert.deepEqual(left('closed-long-ago'), [ids.owner]);
  assert.equal(left('still-open').length, 2);
  assert.equal(left('encrypted-undecided').length, 2, 'an encrypted vote keeps it until its totals are decrypted');
});

test('copies taken before upgrades go after UPGRADE_COPY_DAYS, or sooner under a shorter policy', async () => {
  const copy = (age) => {
    const name = `pre-migration-${now - age}-schema-31.db`;
    fs.writeFileSync(path.join(srv.dataDir, name), 'copy');
    return name;
  };
  const old = copy(3 * DAY);
  const recent = copy(DAY + 3_600_000);
  const fresh = copy(60_000);
  await purge();
  const listed = () => fs.readdirSync(srv.dataDir).filter((n) => n.startsWith('pre-migration-')).sort();
  assert.deepEqual(listed(), [recent, fresh].sort());
  assert.ok(!listed().includes(old));

  retention.set({ commentDays: 1 });
  await purge();
  retention.set({ commentDays: 0 });
  assert.deepEqual(listed(), [fresh]);
});
