import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Identity } from '@semaphore-protocol/identity';
import { poseidon2 } from 'poseidon-lite/poseidon2';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed from './helpers/sealed.js';
import fakeMessages from './helpers/fakeMessages.js';
import aiCredit from './helpers/aiCredit.js';
import fieldHash from '../votes/fieldHash.js';

// Anonymous AI requests with real Semaphore proofs, made here the way a member's browser makes
// them. The plan has a one-day trial and no grace, so the last test can step past it.
const TREASURY = '0x7777777777777777777777777777777777777777';
const MINUTE = 60_000;
const DAY = 86_400_000;

let srv;
let model;
let credit;
const chain = mockChain();
const base = () => srv.base;
const people = { owner: client(base), ana: client(base), ben: client(base), cy: client(base), dee: client(base) };
const keys = Object.fromEntries(['owner', 'ana', 'ben', 'cy', 'dee'].map((n) => [n, new Identity(`ai-credit-secret-${n}`)]));
const ids = {};
const draft = { instruction: 'A one-page launch plan', title: 'Launch', context: '' };

const info = async () => (await people.owner('GET', '/api/ai-credits')).data;
const rows = (query, ...args) => {
  const db = new DatabaseSync(path.join(srv.dataDir, 'nonos.db'));
  try {
    return db.prepare(query).all(...args).map((row) => ({ ...row }));
  } finally {
    db.close();
  }
};
// step the clock for the server too (it runs in this process), then put it back
async function later(ms, fn) {
  const realNow = Date.now;
  Date.now = () => realNow() + ms;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}

before(async () => {
  model = await fakeMessages({ reply: (body) => `Draft for: ${body.messages[0].content.length} characters` });
  srv = await startServer({
    chain,
    env: { PLAN_TREASURY: TREASURY, PLAN_TRIAL_DAYS: '1', PLAN_GRACE_DAYS: '0', ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_BASE_URL: model.url, ANTHROPIC_MODEL: 'test-model', AI_REQUESTS_PER_DAY: '3', AI_CREDIT_ROOT_MINUTES: '10' },
  });
  ids.owner = (await people.owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const name of ['ana', 'ben', 'cy', 'dee']) {
    const inv = await people.owner('POST', '/api/invites', { role: 'member' });
    ids[name] = (await people[name].wallet(wallet(), 'invite', { name, inviteToken: inv.data.token })).data.user.id;
  }
  for (const name of ['owner', 'ana', 'ben', 'cy']) assert.equal((await people[name]('PUT', '/api/me/semaphore', { commitment: keys[name].commitment.toString() })).status, 200);
  const boot = (await people.ana('GET', '/api/bootstrap')).data;
  assert.equal(boot.aiAnonymous, true);
  credit = aiCredit(base, boot.workspaceKey);
});
after(() => {
  model.close();
  srv.close();
  globalThis.curve_bn128?.terminate();
});

test('a member drafts anonymously, and nothing the server keeps names them', async () => {
  const group = await info();
  assert.deepEqual([group.on, group.slots, group.depth, group.day, group.spent], [true, 3, 16, credit.day(), []]);
  assert.deepEqual(group.members, ['owner', 'ana', 'ben', 'cy'].map((n) => keys[n].commitment.toString()).sort());

  const request = await credit.request(keys.ana, group.members, 'draft', draft, { slot: 1 });
  const res = await credit.send('draft', request);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.match(res.data.text, /^Draft for: /);

  // the provider got the instruction, and nothing about who asked
  const sent = model.requests.at(-1);
  assert.match(sent.body.messages[0].content, /A one-page launch plan/);
  const reached = JSON.stringify(sent);
  for (const clue of [ids.ana, 'ana', keys.ana.commitment.toString(), request.proof.nullifier]) assert.ok(!reached.includes(clue), `the provider saw ${clue}`);

  // the database keeps the nullifier with its day, and a count; no time, account or address
  const spent = rows('SELECT * FROM ai_credit_nullifiers');
  assert.deepEqual(spent, [{ scope: credit.scope(credit.day(), 1), nullifier: request.proof.nullifier, day: credit.day() }]);
  assert.deepEqual(rows('SELECT * FROM ai_credit_usage'), [{ day: credit.day(), requests: 1 }]);
  for (const { name } of rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'ai_credit_nullifiers'")) {
    assert.ok(!JSON.stringify(rows(`SELECT * FROM "${name}"`)).includes(request.proof.nullifier), `${name} holds the nullifier`);
  }

  // the same proof again spends the same nullifier, so it's refused
  const again = await credit.send('draft', request);
  assert.equal(again.status, 409);
  assert.match(again.data.error, /already used/);
  assert.equal(model.requests.length, 1);
});

test('each member has k slots a day; a slot outside them is refused', async () => {
  const group = await info();
  // Ana's browser finds which of its slots are spent from the nullifiers alone
  const mine = (slot) => poseidon2([BigInt(fieldHash(credit.scope(credit.day(), slot))), keys.ana.secretScalar]).toString();
  assert.deepEqual([0, 1, 2].filter((s) => group.spent.includes(mine(s))), [1]);

  for (const slot of [0, 2]) assert.equal((await credit.send('draft', await credit.request(keys.ana, group.members, 'draft', draft, { slot }))).status, 200);
  const outside = await credit.send('draft', await credit.request(keys.ana, group.members, 'draft', draft, { slot: 3 }));
  assert.equal(outside.status, 400);
  assert.match(outside.data.error, /slot doesn’t exist/);
  // another member's slot 0 is their own
  assert.equal((await credit.send('draft', await credit.request(keys.ben, group.members, 'draft', draft, { slot: 0 }))).status, 200);
  assert.equal((await info()).spent.length, 4);
});

test('a proof for another day, slot, workspace or vote is refused', async () => {
  const { members } = await info();
  const yesterday = credit.day(Date.now() - DAY);
  const old = await credit.send('draft', await credit.request(keys.cy, members, 'draft', draft, { day: yesterday }));
  assert.match(old.data.error, /different day/);
  const otherSlot = await credit.send('draft', await credit.request(keys.cy, members, 'draft', draft, { slot: 0, sign: { scope: credit.scope(credit.day(), 1) } }));
  assert.match(otherSlot.data.error, /different slot or workspace/);
  const elsewhere = await credit.send('draft', await credit.request(keys.cy, members, 'draft', draft, { sign: { scope: credit.scope(credit.day(), 0, 'another-workspace-key') } }));
  assert.match(elsewhere.data.error, /different slot or workspace/);
  const ballot = await credit.send('draft', await credit.request(keys.cy, members, 'draft', draft, { sign: { scope: '12345' } }));
  assert.match(ballot.data.error, /different slot or workspace/);
  assert.equal(old.status, 409);
  for (const res of [otherSlot, elsewhere, ballot]) assert.equal(res.status, 400);
});

test('a proof is bound to its exact request', async () => {
  const { members } = await info();
  const made = await credit.request(keys.cy, members, 'draft', draft, { slot: 1 });
  const swapped = await credit.send('draft', { ...made, payload: JSON.stringify({ ...draft, instruction: 'Something else entirely' }) });
  assert.equal(swapped.status, 400);
  assert.match(swapped.data.error, /different request/);
  const elsewhere = await credit.send('extract', made);
  assert.match(elsewhere.data.error, /different request/);
  const tampered = await credit.send('draft', { ...made, proof: { ...made.proof, points: made.proof.points.map((p, i) => (i === 0 ? (BigInt(p) + 1n).toString() : p)) } });
  assert.match(tampered.data.error, /doesn’t verify/);
  assert.equal((await credit.send('draft', made)).status, 200);
});

test('a non-member, and a request carrying a session cookie, are refused', async () => {
  const { members } = await info();
  const outsider = new Identity('not-a-member');
  // their own tree with themselves in it has a root the server never handed out
  const res = await credit.send('draft', await credit.request(outsider, [...members, outsider.commitment.toString()], 'draft', draft));
  assert.equal(res.status, 409);
  // Dee is a member but has no voting key, so she isn't in the tree either
  await assert.rejects(credit.request(keys.dee, members, 'draft', draft));
  const withCookie = await credit.send('draft', await credit.request(keys.cy, members, 'draft', draft, { slot: 2 }), { Cookie: people.cy.cookie() });
  assert.equal(withCookie.status, 400);
  assert.match(withCookie.data.error, /session cookie/);
});

test('a root stays good for a short window after someone joins, then goes stale', async () => {
  const before = (await info()).members;
  const early = await credit.request(keys.cy, before, 'brief', { today: credit.day() }, { slot: 2 });
  assert.equal((await people.dee('PUT', '/api/me/semaphore', { commitment: keys.dee.commitment.toString() })).status, 200);
  const after = await info();
  assert.equal(after.members.length, 5);
  // made against the list from before Dee joined, still accepted
  assert.equal((await credit.send('brief', early)).status, 200, 'a proof made just before a join');

  const stale = await credit.request(keys.owner, before, 'brief', { today: credit.day() });
  const res = await later(11 * MINUTE, async () => {
    await info();
    return credit.send('brief', stale);
  });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /member list changed/);
});

test('a member who leaves drops out at once, even against roots that still hold them', async () => {
  const { members } = await info();
  const bens = await credit.request(keys.ben, members, 'draft', draft, { slot: 1 });
  const anas = await credit.request(keys.ana, members, 'brief', { today: credit.day() }, { slot: 0 });
  assert.equal((await people.owner('PATCH', `/api/users/${ids.ben}`, { role: 'guest' })).status, 200);
  const res = await credit.send('draft', bens);
  assert.equal(res.status, 409);
  // the old root held Ben, so it goes for everyone; a fresh list without him works
  assert.equal((await credit.send('brief', anas)).status, 409);
  const now = await info();
  assert.ok(!now.members.includes(keys.ben.commitment.toString()));
  await assert.rejects(credit.request(keys.ben, now.members, 'draft', draft));
  assert.equal((await credit.send('draft', await credit.request(keys.dee, now.members, 'draft', draft, { slot: 1 }))).status, 200);
});

test('anonymous requests only name tasks the whole team can see', async () => {
  const { members } = await info();
  const shared = (await people.owner('POST', '/api/tasks', { title: 'Plan the launch' })).data.task;
  const mine = (await people.owner('POST', '/api/tasks', { title: 'Hidden plans' })).data.task;
  assert.equal((await people.owner('PATCH', `/api/tasks/${mine.id}`, { private: true, sealed: sealed(ids.owner) })).status, 200);
  const ok = await credit.send('describe', await credit.request(keys.dee, members, 'describe', { taskId: shared.id }, { slot: 2 }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.match(model.requests.at(-1).body.messages[0].content, /Plan the launch/);
  const count = model.requests.length;
  const hidden = await credit.send('describe', await credit.request(keys.owner, members, 'describe', { taskId: mine.id }, { slot: 2 }));
  assert.equal(hidden.status, 404);
  assert.equal(model.requests.length, count);
  // the refused request spent nothing, so the slot is still free
  assert.equal((await credit.send('brief', await credit.request(keys.owner, members, 'brief', { today: credit.day() }, { slot: 2 }))).status, 200);
});

test('signed-in requests are the fallback for members without a key, and admins see only totals', async () => {
  const signed = (who) => people[who]('POST', '/api/ai/draft', draft);
  assert.equal((await signed('ana')).status, 409, 'a member with a key sends anonymously');
  assert.equal((await signed('ben')).status, 200, 'a guest has no place in the tree');

  assert.equal((await people.ana('PUT', '/api/ai-credits', { anonymous: false })).status, 403);
  assert.equal((await people.owner('PUT', '/api/ai-credits', { anonymous: false })).status, 200);
  assert.equal((await people.ana('GET', '/api/bootstrap')).data.aiAnonymous, false);
  const { members } = await info();
  assert.equal((await credit.send('draft', await credit.request(keys.cy, members, 'draft', draft, { slot: 0 }))).status, 403);
  assert.equal((await signed('ana')).status, 200);
  assert.equal((await people.owner('PUT', '/api/ai-credits', { anonymous: true })).status, 200);

  assert.equal((await people.ana('GET', '/api/ai-credits/usage')).status, 403);
  const usage = (await people.owner('GET', '/api/ai-credits/usage')).data;
  assert.deepEqual(usage, { on: true, days: [{ day: credit.day(), requests: 9 }] });
  assert.equal((await people.ben('GET', '/api/ai-credits')).status, 403);
});

test('without the plan, a valid proof is refused; yesterday’s nullifiers are gone', async () => {
  await later(2 * DAY, async () => {
    assert.equal((await people.owner('GET', '/api/plan')).data.unlocked, false);
    const group = await info();
    assert.deepEqual(group.spent, []);
    const res = await credit.send('draft', await credit.request(keys.cy, group.members, 'draft', draft, { slot: 0 }));
    assert.equal(res.status, 402);
    assert.match(res.data.error, /Nil Pro/);
    const usage = (await people.owner('GET', '/api/ai-credits/usage')).data;
    assert.equal(usage.days.length, 1);
    assert.deepEqual(rows('SELECT * FROM ai_credit_nullifiers'), []);
  });
});
