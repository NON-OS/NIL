import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import callSocket from './helpers/callSocket.js';

// Attacks on calls from inside the workspace and from outside it: a guest, a removed member and a
// teammate who wasn't asked in, each trying to join, listen in on the handshake, ring people or
// get relay passwords; input over every size limit; floods; and relay passwords that outlive
// their time. What a dishonest server could do to the handshake is checked in the browser, by
// client/test/callStatement.test.ts.
const SECRET = crypto.randomBytes(32).toString('hex');
const ENV = { TURN_URLS: 'turn:turn.example.org:3478', TURN_SECRET: SECRET, TURN_TTL_SECONDS: '120', CALL_SIGNALS_PER_MINUTE: '40', CALL_STARTS_PER_MINUTE: '30', CALL_SIGNAL_MAX_KB: '8' };

let srv;
const base = () => srv.base;
const people = { owner: client(base), ana: client(base), eve: client(base), guest: client(base), gone: client(base), stranger: client(base) };
const ids = {};
const sockets = [];
const session = () => crypto.randomBytes(12).toString('base64url');

async function tab(who) {
  const s = await callSocket(srv.base, people[who].cookie());
  sockets.push(s);
  return s;
}

// a one-to-one call between the owner and Ana, both in it
async function liveCall() {
  const owner = await tab('owner');
  const ana = await tab('ana');
  const call = (await people.owner('POST', '/api/calls', { with: [ids.ana] })).data.call;
  for (const s of [owner, ana]) {
    s.send({ type: 'call.join', callId: call.id, session: session() });
    await s.next('call.joined', (e) => e.call.id === call.id);
  }
  return { callId: call.id, owner, ana };
}

before(async () => {
  srv = await startServer({ env: ENV });
  ids.owner = (await people.owner.wallet(wallet(), 'setup', { name: 'Olive Owner', workspaceName: 'Calls' })).data.user.id;
  ids.project = (await people.owner('POST', '/api/projects', { name: 'Launch' })).data.project.id;
  for (const who of ['ana', 'eve', 'guest', 'gone']) {
    const invite = await people.owner('POST', '/api/invites', who === 'guest' ? { role: 'guest', projectIds: [ids.project] } : { role: 'member' });
    ids[who] = (await people[who].wallet(wallet(), 'invite', { name: who, inviteToken: invite.data.token })).data.user.id;
  }
  // the stranger signed in to a workspace of their own and brings that cookie here
  people.stranger.cookie = () => `nonos_session=${crypto.randomBytes(32).toString('base64url')}`;
});
after(() => {
  for (const s of sockets) s.close();
  srv.close();
});

test('a teammate who wasn’t asked in can’t see, join, ring into, listen to or get relay passwords for a call', async () => {
  const { callId, owner, ana } = await liveCall();
  const eve = await tab('eve');
  assert.ok(await eve.quiet('call.update', 150, (e) => e.call.id === callId));
  assert.equal((await people.eve('GET', '/api/calls')).data.calls.length, 0);
  // a real call and a made-up id look the same from outside
  for (const id of [callId, 'AAAAAAAAAAAA']) {
    assert.equal((await people.eve('POST', `/api/calls/${id}/turn`)).status, 404);
    assert.equal((await people.eve('POST', `/api/calls/${id}/invite`, { userIds: [ids.eve] })).status, 404);
    eve.send({ type: 'call.join', callId: id, session: session() });
    assert.equal((await eve.next('call.refused', (e) => e.callId === id)).reason, 'gone');
  }
  // the handshake can't be sent in, or drawn out
  eve.send({ type: 'call.signal', callId, to: ids.ana, blob: 'hello' });
  owner.send({ type: 'call.signal', callId, to: ids.eve, blob: 'secret' });
  eve.send({ type: 'call.leave', callId });
  eve.send({ type: 'call.decline', callId });
  assert.ok(await ana.quiet('call.signal', 200));
  assert.ok(await eve.quiet('call.signal', 50));
  assert.equal((await people.owner('GET', '/api/calls')).data.calls.find((c) => c.id === callId).members.length, 2);
  // nor can a member of the call sign a message as someone else, or to themselves
  ana.send({ type: 'call.signal', callId, to: ids.ana, blob: 'loop' });
  assert.ok(await ana.quiet('call.signal', 150));
  for (const s of [owner, ana]) s.send({ type: 'call.leave', callId });
});

test('guests, removed members and strangers get no calls, no rings and no relay passwords', async () => {
  const guest = await tab('guest');
  const call = (await people.owner('POST', '/api/calls', { projectId: ids.project })).data.call;
  assert.ok(await guest.quiet('call.update', 150));
  for (const [method, url, body] of [['GET', '/api/calls/settings'], ['GET', '/api/calls'], ['POST', '/api/calls', { with: [ids.owner] }], ['POST', `/api/calls/${call.id}/turn`], ['POST', `/api/calls/${call.id}/invite`, { userIds: [ids.ana] }]]) {
    assert.equal((await people.guest(method, url, body)).status, 403, `${method} ${url}`);
    assert.equal((await people.stranger(method, url, body)).status, 401, `${method} ${url}`);
  }
  guest.send({ type: 'call.join', callId: call.id, session: session() });
  assert.equal((await guest.next('call.refused')).reason, 'gone');
  // nobody can ring a guest, or someone the team removed
  assert.equal((await people.owner('PATCH', `/api/users/${ids.gone}`, { deactivated: true })).status, 200);
  for (const who of [ids.guest, ids.gone, 'nobody-here']) assert.equal((await people.owner('POST', '/api/calls', { with: [who] })).status, 400);
  assert.equal((await people.gone('GET', '/api/calls')).status, 401);
});

test('every input has a size and a shape, over HTTP and over the socket', async () => {
  const bad = [
    { with: ids.ana },
    { with: [] },
    { with: Array.from({ length: 9 }, () => ids.ana) },
    { with: [{ id: ids.ana }] },
    { with: ['x'.repeat(33)] },
    { projectId: 'x'.repeat(33) },
    { projectId: ['nope'] },
  ];
  for (const body of bad) assert.ok([400, 404].includes((await people.owner('POST', '/api/calls', body)).status), JSON.stringify(body).slice(0, 80));
  assert.equal((await people.owner('PUT', '/api/calls/settings', { direct: 1 })).status, 400);
  assert.equal((await people.owner('POST', `/api/calls/${'x'.repeat(40)}/turn`)).status, 404);

  const { callId, owner, ana } = await liveCall();
  assert.equal((await people.owner('POST', `/api/calls/${callId}/invite`, { userIds: 'everyone' })).status, 400);
  for (const msg of [
    { type: 'call.join', callId: 'x'.repeat(33), session: session() },
    { type: 'call.join', callId, session: 'short' },
    { type: 'call.join', callId, session: { a: 1 } },
    { type: 'call.signal', callId, to: 'x'.repeat(33), blob: 'hi' },
    { type: 'call.signal', callId, to: ids.ana, blob: { sdp: 'v=0' } },
    { type: 'call.signal', callId, to: ids.ana, blob: 'x'.repeat(8 * 1024 + 1) },
    { type: 'call.signal', callId: [callId], to: ids.ana, blob: 'hi' },
  ]) {
    owner.send(msg);
  }
  assert.ok(await ana.quiet('call.signal', 250));
  // a frame over the socket's own limit closes only that socket
  const closed = once(owner.ws, 'close');
  owner.send({ type: 'call.signal', callId, to: ids.ana, blob: 'x'.repeat(64 * 1024) });
  assert.equal((await closed)[0], 1009);
  ana.send({ type: 'call.leave', callId });
});

test('handshake floods and call floods are cut off', async () => {
  const { callId, owner, ana } = await liveCall();
  for (let i = 0; i < 60; i++) owner.send({ type: 'call.signal', callId, to: ids.ana, blob: `n${i}` });
  await owner.next('call.limited', (e) => e.callId === callId);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(ana.events.filter((e) => e.type === 'call.signal' && e.callId === callId).length, 40);
  for (const s of [owner, ana]) s.send({ type: 'call.leave', callId });

  // starting calls: thirty a minute here; the next is refused
  const codes = [];
  for (let i = 0; i < 31; i++) codes.push((await people.eve('POST', '/api/calls', { with: [ids.ana] })).status);
  assert.deepEqual(codes, [...Array(30).fill(200), 429]);
});

test('relay passwords stop working at their time, and only this server’s secret makes them', async () => {
  const { default: turnCredentials } = await import('../calls/turnCredentials.js');
  // what coturn checks with use-auth-secret: the HMAC, then that the time in the name is still ahead
  const coturnAccepts = (username, credential, now) => crypto.createHmac('sha1', SECRET).update(username).digest('base64') === credential && Number(username.split(':')[0]) > Math.floor(now / 1000);
  const issued = Date.now();
  const creds = turnCredentials(ids.ana, 'call-one', issued);
  assert.ok(coturnAccepts(creds.username, creds.credential, issued));
  assert.ok(coturnAccepts(creds.username, creds.credential, issued + 119_000));
  assert.ok(!coturnAccepts(creds.username, creds.credential, issued + 121_000));
  // a later time written into the name breaks the password
  const stretched = `${Number(creds.username.split(':')[0]) + 86_400}:${creds.username.split(':')[1]}`;
  assert.ok(!coturnAccepts(stretched, creds.credential, issued));
  // and nobody else's name is in it
  assert.ok(!creds.username.includes(ids.ana));
  assert.notEqual(turnCredentials(ids.owner, 'call-one', issued).username, creds.username);
  // nor can one call's name be tied to the next one's
  assert.notEqual(turnCredentials(ids.ana, 'call-two', issued).username.split(':')[1], creds.username.split(':')[1]);
});

test('someone removed from the team mid-call is out of it at once', async () => {
  const invite = await people.owner('POST', '/api/invites', { role: 'member' });
  const zed = client(base);
  people.zed = zed;
  ids.zed = (await zed.wallet(wallet(), 'invite', { name: 'zed', inviteToken: invite.data.token })).data.user.id;
  const owner = await tab('owner');
  const z = await tab('zed');
  const callId = (await people.owner('POST', '/api/calls', { with: [ids.zed] })).data.call.id;
  for (const s of [owner, z]) {
    s.send({ type: 'call.join', callId, session: session() });
    await s.next('call.joined', (e) => e.call.id === callId);
  }
  assert.equal((await people.owner('PATCH', `/api/users/${ids.zed}`, { deactivated: true })).status, 200);
  const update = await owner.next('call.update', (e) => e.call.id === callId && e.call.members.length === 1, { timeoutMs: 2000 });
  assert.equal(update.call.members[0].userId, ids.owner);
  owner.send({ type: 'call.leave', callId });
});
