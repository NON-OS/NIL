import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import callSocket from './helpers/callSocket.js';

// Calls: starting one, ringing, joining, the handshake passed between two browsers, leaving and
// the call being forgotten, project calls, rejoining after a dropped socket, and relay passwords.
const SECRET = crypto.randomBytes(32).toString('hex');
const ENV = { TURN_URLS: 'turns:turn.example.org:5349?transport=tcp,turn:turn.example.org:3478', TURN_SECRET: SECRET, TURN_TTL_SECONDS: '600', CALL_MAX_PEERS: '3', CALL_RING_SECONDS: '3', CALL_REJOIN_SECONDS: '2', CALL_STARTS_PER_MINUTE: '60' };

let srv;
const base = () => srv.base;
const people = { owner: client(base), ana: client(base), ben: client(base), cy: client(base), guest: client(base) };
const ids = {};
const sockets = [];
const session = () => crypto.randomBytes(12).toString('base64url');

async function tab(who) {
  const s = await callSocket(srv.base, people[who].cookie());
  sockets.push(s);
  return s;
}

async function join(s, callId, extra = {}) {
  const me = extra.session ?? session();
  s.send({ type: 'call.join', callId, session: me, ...extra });
  return s.next('call.joined', (e) => e.call.id === callId);
}

before(async () => {
  srv = await startServer({ env: ENV });
  ids.owner = (await people.owner.wallet(wallet(), 'setup', { name: 'Olive Owner', workspaceName: 'Calls' })).data.user.id;
  ids.project = (await people.owner('POST', '/api/projects', { name: 'Launch' })).data.project.id;
  for (const who of ['ana', 'ben', 'cy', 'guest']) {
    const invite = await people.owner('POST', '/api/invites', who === 'guest' ? { role: 'guest', projectIds: [ids.project] } : { role: 'member' });
    ids[who] = (await people[who].wallet(wallet(), 'invite', { name: who, inviteToken: invite.data.token })).data.user.id;
  }
});
after(() => {
  for (const s of sockets) s.close();
  srv.close();
});

test('members see whether calls work here; only admins allow direct connections', async () => {
  const status = await people.ana('GET', '/api/calls/settings');
  assert.equal(status.status, 200);
  assert.deepEqual(status.data, { available: true, reason: null, relay: true, direct: false, maxPeers: 3, sfu: false, meshMaxPeers: 4, ringSeconds: 3 });
  assert.equal((await people.guest('GET', '/api/calls/settings')).status, 403);
  assert.equal((await people.ana('PUT', '/api/calls/settings', { direct: true })).status, 403);
  assert.equal((await people.owner('PUT', '/api/calls/settings', { direct: 'yes' })).status, 400);
  assert.equal((await people.owner('PUT', '/api/calls/settings', { direct: true })).data.direct, true);
  assert.equal((await people.owner('POST', '/api/calls', { with: [ids.ana] })).status, 200);
  const turn = await people.owner('GET', '/api/calls').then(async (r) => people.owner('POST', `/api/calls/${r.data.calls[0].id}/turn`));
  assert.equal(turn.data.policy, 'all');
  assert.equal((await people.owner('PUT', '/api/calls/settings', { direct: false })).data.direct, false);
});

test('a one-to-one call rings, connects, passes the handshake along and is forgotten when it ends', async () => {
  const owner = await tab('owner');
  const ana = await tab('ana');
  const anaPhone = await tab('ana');
  const ben = await tab('ben');
  const started = await people.owner('POST', '/api/calls', { with: [ids.ana] });
  assert.equal(started.status, 200);
  const callId = started.data.call.id;
  assert.deepEqual(started.data.call.ringing, [ids.ana]);
  // every tab of the person rung hears it, nobody else does
  assert.equal((await ana.next('call.ring', (e) => e.call.id === callId, { seen: true })).call.startedBy, ids.owner);
  await anaPhone.next('call.ring', (e) => e.call.id === callId, { seen: true });
  assert.ok(await ben.quiet('call.ring', 200));
  assert.equal((await people.ben('GET', '/api/calls')).data.calls.some((c) => c.id === callId), false);

  await join(owner, callId);
  const joined = await join(ana, callId);
  assert.deepEqual(joined.call.members.map((m) => m.userId).sort(), [ids.ana, ids.owner].sort());
  // answering on one tab stops the ring on the others
  await anaPhone.next('call.ring.end', (e) => e.callId === callId, { seen: true });

  // the server stamps who a handshake message is from, whatever the message claims
  const blob = JSON.stringify({ sdp: 'v=0', from: ids.ben });
  owner.send({ type: 'call.signal', callId, to: ids.ana, blob, from: ids.ben });
  const signal = await ana.next('call.signal', (e) => e.callId === callId);
  assert.equal(signal.from, ids.owner);
  assert.equal(signal.blob, blob);
  // a tab of the same person that didn't join gets nothing
  assert.ok(await anaPhone.quiet('call.signal', 200));

  ana.send({ type: 'call.leave', callId });
  const update = await owner.next('call.update', (e) => e.call.id === callId && e.call.members.length === 1);
  assert.equal(update.call.members[0].userId, ids.owner);
  owner.send({ type: 'call.leave', callId });
  await owner.next('call.end', (e) => e.callId === callId);
  await ana.next('call.end', (e) => e.callId === callId, { seen: true });
  for (const who of ['owner', 'ana']) assert.equal((await people[who]('GET', '/api/calls')).data.calls.some((c) => c.id === callId), false);
  assert.equal((await people.owner('POST', `/api/calls/${callId}/turn`)).status, 404);
});

test('a project call is open to the team, never to guests, and holds no more than the cap', async () => {
  const [owner, ana, ben, cy, guest] = await Promise.all(['owner', 'ana', 'ben', 'cy', 'guest'].map(tab));
  const started = await people.owner('POST', '/api/calls', { projectId: ids.project });
  const callId = started.data.call.id;
  await ben.next('call.update', (e) => e.call.id === callId, { seen: true });
  assert.ok(await guest.quiet('call.update', 200));
  assert.equal((await people.guest('GET', '/api/calls')).status, 403);
  assert.ok((await people.ben('GET', '/api/calls')).data.calls.some((c) => c.id === callId));

  await join(owner, callId);
  await join(ana, callId);
  await join(ben, callId);
  cy.send({ type: 'call.join', callId, session: session() });
  assert.equal((await cy.next('call.refused', (e) => e.callId === callId)).reason, 'full');
  guest.send({ type: 'call.join', callId, session: session() });
  assert.equal((await guest.next('call.refused', (e) => e.callId === callId)).reason, 'gone');
  for (const s of [owner, ana, ben]) s.send({ type: 'call.leave', callId });
  await cy.next('call.end', (e) => e.callId === callId, { seen: true });
});

test('a dropped socket keeps its place for a while; a second tab takes the call over', async () => {
  const owner = await tab('owner');
  const ana = await tab('ana');
  const callId = (await people.owner('POST', '/api/calls', { with: [ids.ana] })).data.call.id;
  await join(owner, callId);
  const mine = session();
  await join(ana, callId, { session: mine });
  ana.close();
  // back within the grace period, with the same tab session: nobody is told anything changed
  const again = await tab('ana');
  await join(again, callId, { session: mine });
  assert.equal((await people.ana('GET', '/api/calls')).data.calls.find((c) => c.id === callId).members.length, 2);

  // the same person joining from another tab moves the call there
  const other = await tab('ana');
  await join(other, callId);
  await again.next('call.replaced', (e) => e.callId === callId, { seen: true });
  await owner.next('call.update', (e) => e.call.id === callId && e.call.members.find((m) => m.userId === ids.ana)?.session !== mine, { seen: true });

  // gone for longer than the grace period: they're out
  other.close();
  await owner.next('call.update', (e) => e.call.id === callId && e.call.members.length === 1, { timeoutMs: 5000 });
  owner.send({ type: 'call.leave', callId });
  await owner.next('call.end', (e) => e.callId === callId);
});

test('an unanswered ring stops on its own, a declined one tells the caller, and an empty call ends', async () => {
  const owner = await tab('owner');
  const ben = await tab('ben');
  const cy = await tab('cy');
  const callId = (await people.owner('POST', '/api/calls', { with: [ids.ben, ids.cy] })).data.call.id;
  await join(owner, callId);
  await cy.next('call.ring', (e) => e.call.id === callId, { seen: true });
  cy.send({ type: 'call.decline', callId });
  assert.equal((await owner.next('call.declined', (e) => e.callId === callId)).userId, ids.cy);
  await ben.next('call.ring.end', (e) => e.callId === callId, { timeoutMs: 5000 });
  const quiet = await owner.next('call.update', (e) => e.call.id === callId && e.call.ringing.length === 0, { seen: true });
  assert.equal(quiet.call.members.length, 1);
  owner.send({ type: 'call.leave', callId });
  await owner.next('call.end', (e) => e.callId === callId);

  // a call its starter never joins is dropped when the ring runs out
  const lonely = (await people.owner('POST', '/api/calls', { with: [ids.ben] })).data.call.id;
  await ben.next('call.end', (e) => e.callId === lonely, { timeoutMs: 6000 });
});

test('relay passwords are the coturn kind: HMAC of an expiring username, naming nobody', async () => {
  const owner = await tab('owner');
  const callId = (await people.owner('POST', '/api/calls', { with: [ids.ana] })).data.call.id;
  await join(owner, callId);
  const before = Math.floor(Date.now() / 1000);
  const res = await people.owner('POST', `/api/calls/${callId}/turn`);
  assert.equal(res.status, 200);
  const [server] = res.data.iceServers;
  assert.deepEqual(server.urls, ENV.TURN_URLS.split(','));
  const [expires, name] = server.username.split(':');
  assert.ok(Number(expires) >= before + 600 && Number(expires) <= before + 602);
  assert.ok(!server.username.includes(ids.owner) && name.length === 16);
  assert.equal(server.credential, crypto.createHmac('sha1', SECRET).update(server.username).digest('base64'));
  assert.equal(res.data.policy, 'relay');
  assert.equal(res.data.expiresAt, Number(expires) * 1000);
  // the same person always gets the same name, so coturn's per-user quota holds
  const second = (await people.owner('POST', `/api/calls/${callId}/turn`)).data.iceServers[0].username;
  assert.equal(second.split(':')[1], name);
  owner.send({ type: 'call.leave', callId });
});
