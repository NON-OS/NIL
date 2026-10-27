import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import callSocket from './helpers/callSocket.js';

// Bigger calls on the SFU: a call moves there once it outgrows the mesh, only people in it get a
// room token, the token names nobody, and whoever leaves is dropped from the SFU. A stand-in for
// LiveKit's API records what the server asks of it.
const SECRET = crypto.randomBytes(32).toString('hex');
const asked = [];
let sfu;
let srv;
const base = () => srv.base;
const people = { owner: client(base), ana: client(base), ben: client(base), cy: client(base) };
const ids = {};
const sockets = [];
const session = () => crypto.randomBytes(12).toString('base64url');

const claims = (token) => {
  const [head, body, sig] = token.split('.');
  assert.equal(crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url'), sig);
  return JSON.parse(Buffer.from(body, 'base64url').toString());
};

before(async () => {
  sfu = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      asked.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') });
      res.end('{}');
    });
  });
  sfu.listen(0, '127.0.0.1');
  await once(sfu, 'listening');
  srv = await startServer({
    env: { TURN_URLS: 'turn:turn.example.org:3478', TURN_SECRET: SECRET, SFU_URL: 'wss://sfu.example.org', SFU_API_URL: `http://127.0.0.1:${sfu.address().port}`, SFU_API_KEY: 'nilkey', SFU_API_SECRET: SECRET, CALL_MESH_MAX_PEERS: '2', CALL_STARTS_PER_MINUTE: '60' },
  });
  ids.owner = (await people.owner.wallet(wallet(), 'setup', { name: 'Olive Owner', workspaceName: 'Calls' })).data.user.id;
  ids.project = (await people.owner('POST', '/api/projects', { name: 'Launch' })).data.project.id;
  for (const who of ['ana', 'ben', 'cy']) {
    const invite = await people.owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await people[who].wallet(wallet(), 'invite', { name: who, inviteToken: invite.data.token })).data.user.id;
  }
});
after(() => {
  for (const s of sockets) s.close();
  srv.close();
  sfu.close();
});

test('a call outgrows the mesh, moves to the SFU, and hands room tokens only to the people in it', async () => {
  const status = (await people.ana('GET', '/api/calls/settings')).data;
  assert.equal(status.sfu, true);
  assert.equal(status.maxPeers, 50);
  const callId = (await people.owner('POST', '/api/calls', { with: [ids.ana, ids.ben] })).data.call.id;
  const tabs = {};
  for (const who of ['owner', 'ana']) {
    tabs[who] = await callSocket(srv.base, people[who].cookie());
    sockets.push(tabs[who]);
    tabs[who].send({ type: 'call.join', callId, session: session() });
    assert.equal((await tabs[who].next('call.joined', (e) => e.call.id === callId)).call.mode, 'mesh');
  }
  // two is a mesh; no SFU tokens yet
  assert.equal((await people.owner('POST', `/api/calls/${callId}/sfu`)).status, 409);
  tabs.ben = await callSocket(srv.base, people.ben.cookie());
  sockets.push(tabs.ben);
  const benSession = session();
  tabs.ben.send({ type: 'call.join', callId, session: benSession });
  assert.equal((await tabs.ben.next('call.joined', (e) => e.call.id === callId)).call.mode, 'sfu');
  await tabs.owner.next('call.update', (e) => e.call.id === callId && e.call.mode === 'sfu', { seen: true });

  const grant = (await people.ben('POST', `/api/calls/${callId}/sfu`)).data;
  assert.equal(grant.url, 'wss://sfu.example.org');
  const c = claims(grant.token);
  assert.equal(c.iss, 'nilkey');
  assert.equal(c.sub, grant.identity);
  assert.ok(![ids.ben, callId].some((id) => grant.token.includes(id) || JSON.stringify(c).includes(id)), 'the SFU learns neither who nor which call');
  assert.deepEqual(Object.keys(c.video).sort(), ['canPublish', 'canPublishData', 'canSubscribe', 'canUpdateOwnMetadata', 'room', 'roomJoin']);
  assert.equal(c.video.canPublishData, false);
  assert.ok(c.exp - c.nbf <= 700);
  // the same person in another call, or another tab, goes by another name
  assert.notEqual((await people.ana('POST', `/api/calls/${callId}/sfu`)).data.identity, grant.identity);
  // Cy, on the team but not in the call, gets nothing; nor does anyone in a call they haven't joined
  assert.equal((await people.cy('POST', `/api/calls/${callId}/sfu`)).status, 404);

  // Ben leaves: the SFU is told to drop him, with an admin token for that room only
  tabs.ben.send({ type: 'call.leave', callId });
  await tabs.owner.next('call.update', (e) => e.call.id === callId && e.call.members.length === 2, { seen: true });
  await new Promise((r) => setTimeout(r, 200));
  const removal = asked.find((a) => a.path === '/twirp/livekit.RoomService/RemoveParticipant');
  assert.deepEqual(removal.body, { room: c.video.room, identity: grant.identity });
  assert.equal(claims(removal.auth.slice(7)).video.roomAdmin, true);
  // the call stays on the SFU even with two left; when it ends the room goes
  for (const who of ['owner', 'ana']) tabs[who].send({ type: 'call.leave', callId });
  await tabs.owner.next('call.end', (e) => e.callId === callId, { seen: true });
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(asked.find((a) => a.path === '/twirp/livekit.RoomService/DeleteRoom').body, { room: c.video.room });
});
