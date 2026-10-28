import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import socket from './helpers/socket.js';

// A member made a guest keeps the keys they were given, as someone switched off does, but from
// then on hears nothing about docs or folders, gets no live changes, and can't be given new keys.
const chars = (bytes) => crypto.randomBytes(bytes).toString('base64url');
let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ids = {};

before(async () => {
  srv = await startServer();
  const wo = wallet();
  const wa = wallet();
  ids.owner = (await owner.wallet(wo, 'setup', { name: 'Owner', workspaceName: 'Demotion' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.ana = (await ana.wallet(wa, 'invite', { name: 'Ana', inviteToken: inv.data.token })).data.user.id;
  await publishKey(owner, wo);
  await publishKey(ana, wa);
  ids.project = (await owner('POST', '/api/projects', { name: 'Shared' })).data.project.id;
  ids.doc = chars(16);
  const grants = [ids.owner, ids.ana].map((userId) => ({ userId, wrappedKey: chars(92) }));
  assert.equal((await owner('POST', '/api/docs', { id: ids.doc, titleCt: chars(30), bodyCt: chars(100), audience: 'team', grants })).status, 200);
});
after(() => srv.close());

test('a member made a guest is cut off from docs at once and hears nothing more about them', async () => {
  const before = await socket(base(), ana.cookie());
  assert.equal((await owner('PATCH', `/api/users/${ids.ana}`, { role: 'guest' })).status, 200);
  assert.equal(await before.closed, 4001);

  // the open tab was closed; a new one is a guest's
  const live = await socket(base(), ana.cookie());
  await owner('POST', `/api/docs/${ids.doc}/updates`, { updateCt: chars(200) });
  const doc = (await owner('GET', `/api/docs/${ids.doc}`)).data.doc;
  await owner('PUT', `/api/docs/${ids.doc}`, { baseVersion: doc.version, titleCt: chars(30), bodyCt: chars(100) });
  await sleep(200);
  assert.deepEqual(live.events.filter((e) => e.type === 'doc-update' || e.type === 'docs'), []);
  live.close();

  assert.equal((await ana('GET', `/api/docs/${ids.doc}`)).status, 403);
  // nobody can hand a guest a key, to this doc or a new one
  assert.equal((await owner('POST', `/api/docs/${ids.doc}/grants`, { grants: [{ userId: ids.ana, wrappedKey: chars(92) }] })).status, 400);
});
