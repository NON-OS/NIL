import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import socket from './helpers/socket.js';

// What live doc changes may cost the server: bytes waiting per doc, bytes sent per person, how
// much one answer carries, and what travels with each live event.
const chars = (n) => crypto.randomBytes(Math.ceil((n * 3) / 4)).toString('base64url').slice(0, n);
let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ids = {};

async function newDoc(readers) {
  const id = crypto.randomBytes(16).toString('base64url');
  const grants = readers.map((userId) => ({ userId, wrappedKey: crypto.randomBytes(92).toString('base64url') }));
  assert.equal((await owner('POST', '/api/docs', { id, titleCt: chars(40), bodyCt: chars(200), audience: 'people', grants })).status, 200);
  return id;
}

before(async () => {
  srv = await startServer({ env: { DOC_PENDING_MB: '1', DOC_UPDATE_MB_PER_MINUTE: '2', DOC_LIVE_INLINE_KB: '1', DOC_UPDATES_PAGE_KB: '64' } });
  const wo = wallet();
  const wa = wallet();
  ids.owner = (await owner.wallet(wo, 'setup', { name: 'Owner', workspaceName: 'Limits' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.ana = (await ana.wallet(wa, 'invite', { name: 'Ana', inviteToken: inv.data.token })).data.user.id;
  await publishKey(owner, wo);
  await publishKey(ana, wa);
});
after(() => srv.close());

test('a long backlog comes a page at a time, and every change arrives once', async () => {
  const doc = await newDoc([ids.owner, ids.ana]);
  for (let i = 0; i < 10; i++) assert.equal((await owner('POST', `/api/docs/${doc}/updates`, { updateCt: chars(20_000) })).status, 200);
  const opened = (await ana('GET', `/api/docs/${doc}`)).data.doc;
  assert.ok(opened.updatesMore);
  assert.ok(opened.updates.length < 10);
  const seen = opened.updates.map((u) => u.seq);
  let more = true;
  while (more) {
    const page = (await ana('GET', `/api/docs/${doc}/updates?after=${seen.at(-1)}`)).data;
    seen.push(...page.updates.map((u) => u.seq));
    more = page.more;
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('a small change travels with its event, a big one is only announced', async () => {
  const doc = await newDoc([ids.owner, ids.ana]);
  const live = await socket(base(), ana.cookie());
  await owner('POST', `/api/docs/${doc}/updates`, { updateCt: chars(500) });
  await owner('POST', `/api/docs/${doc}/updates`, { updateCt: chars(5000) });
  await sleep(150);
  const events = live.events.filter((e) => e.type === 'doc-update' && e.docId === doc);
  live.close();
  assert.deepEqual(events.map((e) => [e.seq, typeof e.updateCt]), [[1, 'string'], [2, 'undefined']]);
});

test('a doc’s waiting changes and one person’s changes a minute are capped in bytes', async () => {
  const doc = await newDoc([ids.owner]);
  let status = 200;
  let sent = 0;
  while (status === 200 && sent < 100) {
    status = (await owner('POST', `/api/docs/${doc}/updates`, { updateCt: chars(40_000) })).status;
    sent++;
  }
  assert.equal(status, 409, 'the doc wants a version first');
  assert.ok(sent <= 27);

  // a version folds them in, and the doc takes changes again
  const current = (await owner('GET', `/api/docs/${doc}`)).data.doc;
  const through = sent - 1;
  assert.equal((await owner('PUT', `/api/docs/${doc}`, { baseVersion: current.version, titleCt: chars(40), bodyCt: chars(200), through })).status, 200);
  assert.equal((await owner('POST', `/api/docs/${doc}/updates`, { updateCt: chars(40_000) })).status, 200);

  // the person has now sent over a megabyte this minute; a second doc meets the per-person cap
  const other = await newDoc([ids.owner]);
  status = 200;
  sent = 0;
  while (status === 200 && sent < 100) {
    status = (await owner('POST', `/api/docs/${other}/updates`, { updateCt: chars(40_000) })).status;
    sent++;
  }
  assert.equal(status, 429);
});
