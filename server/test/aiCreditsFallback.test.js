import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Identity } from '@semaphore-protocol/identity';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import fakeMessages from './helpers/fakeMessages.js';
import aiCredit from './helpers/aiCredit.js';

// When a member can't prove membership right now, built-in AI falls back to signed-in requests,
// on an allowance of their own. Two requests a day here, so the limit is quick to reach.
const DAY = 86_400_000;

let srv;
let model;
let credit;
const base = () => srv.base;
const people = { owner: client(base), ana: client(base), dee: client(base) };
const keys = { owner: new Identity('fallback-owner'), ana: new Identity('fallback-ana'), anaAfterReset: new Identity('fallback-ana-reset') };
const ids = {};
const draft = { instruction: 'Three ideas for the launch post', title: '', context: '' };
const signed = (who) => people[who]('POST', '/api/ai/draft', draft);
const members = async () => (await people.owner('GET', '/api/ai-credits')).data.members;
const rows = (query, ...args) => {
  const db = new DatabaseSync(path.join(srv.dataDir, 'nonos.db'));
  try {
    return db.prepare(query).all(...args).map((row) => ({ ...row }));
  } finally {
    db.close();
  }
};
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
  model = await fakeMessages();
  srv = await startServer({ env: { ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_BASE_URL: model.url, ANTHROPIC_MODEL: 'test-model', AI_REQUESTS_PER_DAY: '2' } });
  ids.owner = (await people.owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const name of ['ana', 'dee']) {
    const inv = await people.owner('POST', '/api/invites', { role: 'member' });
    ids[name] = (await people[name].wallet(wallet(), 'invite', { name, inviteToken: inv.data.token })).data.user.id;
  }
  for (const name of ['owner', 'ana']) assert.equal((await people[name]('PUT', '/api/me/semaphore', { commitment: keys[name].commitment.toString() })).status, 200);
  credit = aiCredit(base, (await people.ana('GET', '/api/bootstrap')).data.workspaceKey);
});
after(() => {
  model.close();
  srv.close();
  globalThis.curve_bn128?.terminate();
});

test('a member with an accepted key can’t use the signed-in path', async () => {
  const res = await signed('ana');
  assert.equal(res.status, 409);
  assert.match(res.data.error, /anonymously/);
  assert.equal(model.requests.length, 0);
  assert.equal((await credit.send('draft', await credit.request(keys.ana, await members(), 'draft', draft))).status, 200);
});

test('a member without a key sends signed in, on a daily allowance of their own', async () => {
  assert.equal((await signed('dee')).status, 200);
  assert.equal((await signed('dee')).status, 200);
  const third = await signed('dee');
  assert.equal(third.status, 429);
  assert.match(third.data.error, /today’s AI requests/);
  // counted per person and day, and only for the day
  assert.deepEqual(rows('SELECT user_id, requests FROM ai_signed_usage'), [{ user_id: ids.dee, requests: 2 }]);
  await later(DAY, async () => {
    assert.equal((await signed('dee')).status, 200);
    assert.deepEqual(rows('SELECT requests FROM ai_signed_usage').map((r) => r.requests), [1]);
  });
});

test('a member whose key changed after a reset falls back until the new key is accepted', async () => {
  // an open anonymous vote holds Ana's old key, so the new one can't be registered yet
  const vote = (await people.owner('POST', '/api/proposals', { title: 'Ship on Wednesday?', anonymous: true })).data.proposal;
  const switching = await people.ana('PUT', '/api/me/semaphore', { commitment: keys.anaAfterReset.commitment.toString() });
  assert.equal(switching.status, 409);

  // her old key is out of the AI group at once, so it can't spend alongside the fallback
  const list = await members();
  assert.ok(!list.includes(keys.ana.commitment.toString()));
  await assert.rejects(credit.request(keys.ana, list, 'draft', draft, { slot: 1 }));
  await assert.rejects(credit.request(keys.anaAfterReset, list, 'draft', draft, { slot: 1 }));
  assert.equal((await signed('ana')).status, 200);
  assert.equal((await signed('ana')).status, 200);
  assert.equal((await signed('ana')).status, 429, 'the signed-in allowance is her own');

  // once the vote closes the new key goes in, and the signed-in path closes again
  assert.equal((await people.owner('POST', `/api/proposals/${vote.id}/close`)).status, 200);
  assert.equal((await people.ana('PUT', '/api/me/semaphore', { commitment: keys.anaAfterReset.commitment.toString() })).status, 200);
  assert.equal((await signed('ana')).status, 409);
  const now = await members();
  assert.ok(now.includes(keys.anaAfterReset.commitment.toString()));
  assert.equal((await credit.send('draft', await credit.request(keys.anaAfterReset, now, 'draft', draft, { slot: 1 }))).status, 200);
});
