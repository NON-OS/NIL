import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bootProcess from './helpers/bootProcess.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import callSocket from './helpers/callSocket.js';
import SETUP_TOKEN from './helpers/setupToken.js';

// Calls kept in the database: a call outlives a server that crashed and stayed down longer than
// anyone's grace period, two server processes sharing one database pass a call's handshake
// between them, and nothing about a call is left once it ends.
const ENV = { SETUP_TOKEN, TURN_URLS: 'turn:turn.example.org:3478', TURN_SECRET: crypto.randomBytes(32).toString('hex'), CALL_REJOIN_SECONDS: '2', CALL_RING_SECONDS: '20' };
let dataDir;
let servers = [];
const people = {};
const ids = {};
const sockets = [];
const session = () => crypto.randomBytes(12).toString('base64url');

async function boot() {
  const srv = await bootProcess({ dataDir, env: ENV });
  assert.ok(srv.base, srv.stderr());
  servers.push(srv);
  return srv;
}

async function tab(srv, who) {
  const s = await callSocket(srv.base, people[who].cookie());
  sockets.push(s);
  return s;
}

const rows = () => {
  const db = new DatabaseSync(path.join(dataDir, 'nonos.db'), { readOnly: true });
  try {
    return ['calls', 'call_people', 'call_events'].map((t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
  } finally {
    db.close();
  }
};

let a;
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-test-'));
  a = await boot();
  // each client talks to whichever server the test points it at
  let target = a.base;
  for (const who of ['owner', 'ana']) people[who] = client(() => target);
  people.at = (srv) => (target = srv.base);
  ids.owner = (await people.owner.wallet(wallet(), 'setup', { name: 'Olive Owner', workspaceName: 'Calls' })).data.user.id;
  const invite = await people.owner('POST', '/api/invites', { role: 'member' });
  ids.ana = (await people.ana.wallet(wallet(), 'invite', { name: 'Ana', inviteToken: invite.data.token })).data.user.id;
});
after(async () => {
  for (const s of sockets) s.close();
  for (const srv of servers) await srv.stop('SIGKILL');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a call outlives a server that crashed and stayed away longer than the grace period', async () => {
  const owner = await tab(a, 'owner');
  const ana = await tab(a, 'ana');
  const callId = (await people.owner('POST', '/api/calls', { with: [ids.ana] })).data.call.id;
  const mine = { owner: session(), ana: session() };
  for (const [who, s] of [['owner', owner], ['ana', ana]]) {
    s.send({ type: 'call.join', callId, session: mine[who] });
    await s.next('call.joined', (e) => e.call.id === callId);
  }
  await a.stop('SIGKILL');
  await new Promise((r) => setTimeout(r, 4000));
  a = await boot();
  people.at(a);
  const owner2 = await tab(a, 'owner');
  const ana2 = await tab(a, 'ana');
  for (const [who, s] of [['owner', owner2], ['ana', ana2]]) {
    s.send({ type: 'call.join', callId, session: mine[who] });
    const joined = await s.next('call.joined', (e) => e.call.id === callId);
    assert.equal(joined.call.members.length, 2);
  }
  owner2.send({ type: 'call.signal', callId, to: ids.ana, blob: 'after the restart' });
  assert.equal((await ana2.next('call.signal')).blob, 'after the restart');
  for (const s of [owner2, ana2]) s.send({ type: 'call.leave', callId });
  await owner2.next('call.end', (e) => e.callId === callId, { seen: true, timeoutMs: 5000 });
  assert.deepEqual(rows().slice(0, 2), [0, 0]);
});

test('two server processes sharing a database carry one call between them, and forget it after', async () => {
  const b = await boot();
  const owner = await tab(a, 'owner');
  const ana = await tab(b, 'ana');
  people.at(a);
  const callId = (await people.owner('POST', '/api/calls', { with: [ids.ana] })).data.call.id;
  // the ring reaches Ana on the other process
  await ana.next('call.ring', (e) => e.call.id === callId, { timeoutMs: 5000, seen: true });
  owner.send({ type: 'call.join', callId, session: session() });
  await owner.next('call.joined', (e) => e.call.id === callId);
  const anaSession = session();
  ana.send({ type: 'call.join', callId, session: anaSession });
  await ana.next('call.joined', (e) => e.call.id === callId);
  await owner.next('call.update', (e) => e.call.id === callId && e.call.members.length === 2, { seen: true, timeoutMs: 5000 });
  owner.send({ type: 'call.signal', callId, to: ids.ana, blob: 'across processes' });
  assert.equal((await ana.next('call.signal', () => true, { timeoutMs: 5000 })).from, ids.owner);
  ana.send({ type: 'call.signal', callId, to: ids.owner, blob: 'and back' });
  assert.equal((await owner.next('call.signal', () => true, { timeoutMs: 5000 })).blob, 'and back');

  // the process holding Ana's connection goes away; she reconnects to the other one
  await b.stop('SIGKILL');
  const ana2 = await tab(a, 'ana');
  ana2.send({ type: 'call.join', callId, session: anaSession });
  await ana2.next('call.joined', (e) => e.call.id === callId);
  owner.send({ type: 'call.signal', callId, to: ids.ana, blob: 'still here' });
  assert.equal((await ana2.next('call.signal', () => true, { timeoutMs: 5000 })).blob, 'still here');
  for (const s of [owner, ana2]) s.send({ type: 'call.leave', callId });
  await owner.next('call.end', (e) => e.callId === callId, { seen: true, timeoutMs: 5000 });
  assert.deepEqual(rows().slice(0, 2), [0, 0]);
  // what one process passed to the other lasts seconds
  await new Promise((r) => setTimeout(r, 11_000));
  assert.equal(rows()[2], 0);
});
