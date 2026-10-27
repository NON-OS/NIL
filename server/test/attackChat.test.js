import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import socket from './helpers/socket.js';
import chat from './helpers/chatChannel.js';

// Chat as an attacker uses it: files that try to render on the app's origin or climb out of the
// upload folder, oversized everything, floods, and someone outside a conversation listening in
// or typing into it.
let srv;
const base = () => srv.base;
const member = client(base);
const other = client(base);
const outsider = client(base);
const ids = {};
const MB = 1024 * 1024;
const stored = () => fs.readdirSync(path.join(srv.dataDir, 'uploads'));

before(async () => {
  srv = await startServer({ env: { MAX_UPLOAD_MB: '1', CHAT_MESSAGES_PER_MINUTE: '20', CHAT_MAX_MEMBERS: '4', CHAT_GROUP_MAX: '3', CHAT_CHANNELS_PER_HOUR: '12' } });
  const ow = wallet();
  const owner = client(base);
  await owner.wallet(ow, 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
  for (const [c, key] of [[member, 'member'], [other, 'other'], [outsider, 'outsider']]) {
    const w = wallet();
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[key] = (await c.wallet(w, 'invite', { name: key, inviteToken: inv.data.token })).data.user.id;
    await publishKey(c, w);
  }
  ids.channel = (await chat.makeChannel(member, ids.member, { members: [ids.member, ids.other], keyed: [ids.member, ids.other] })).data.channel.id;
});
after(() => srv.close());

const upload = (c, body, headers = {}) => c('POST', `/api/chat/channels/${ids.channel}/files`, new Uint8Array(body), { 'Content-Type': 'application/octet-stream', 'X-Chat-File': chat.chatId(), ...headers });

test('chat files are ciphertext only: no names, no types, never rendered, never outside the folder', async () => {
  assert.equal((await upload(member, Buffer.from('hello'), { 'X-Filename': 'x.html' })).status, 400);
  assert.equal((await upload(member, Buffer.from('<script>alert(1)</script>'), { 'Content-Type': 'text/html' })).status, 400);
  for (const id of ['../../nonos.db', '..%2F..', 'a'.repeat(22).replace(/a$/, '/'), '<script>']) assert.equal((await upload(member, Buffer.from('x'), { 'X-Chat-File': id })).status, 400);
  assert.equal((await upload(outsider, Buffer.from('hello'))).status, 404);
  const before = stored();
  assert.equal((await upload(member, Buffer.alloc(MB + 100))).status, 413);
  assert.deepEqual(stored(), before, 'nothing left from a refused upload');
  const ok = await upload(member, Buffer.from('<html><script>alert(document.cookie)</script></html>'));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const again = await upload(member, Buffer.from('x'), { 'X-Chat-File': ok.data.file.id });
  assert.equal(again.status, 400, 'an id already taken');
  const got = await fetch(`${base()}/api/chat/files/${ok.data.file.id}`, { headers: { Cookie: other.cookie() } });
  assert.equal(got.headers.get('content-type'), 'application/octet-stream');
  assert.match(got.headers.get('content-disposition'), /^attachment/);
  assert.match(got.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(`${base()}/api/chat/files/${ok.data.file.id}`, { headers: { Cookie: outsider.cookie() } })).status, 404);
  assert.ok(stored().every((f) => /^[\w-]+$/.test(f)), stored().join(', '));
  // only its uploader can post it, in its own conversation, once
  const url = `/api/chat/channels/${ids.channel}/messages`;
  assert.equal((await other('POST', url, chat.message(1, { files: [ok.data.file.id] }))).status, 400);
  assert.equal((await member('POST', url, chat.message(1, { kind: 'reaction', files: [ok.data.file.id] }))).status, 400);
  const posted = await member('POST', url, chat.message(1, { files: [ok.data.file.id] }));
  assert.equal(posted.status, 200);
  assert.equal((await member('POST', url, chat.message(1, { files: [ok.data.file.id] }))).status, 400);
  // deleting the message takes the file with it
  await member('PUT', `/api/chat/messages/${posted.data.message.id}`, { epoch: 1, bodyCt: 'D'.repeat(100), edits: 1, deleted: true });
  assert.equal((await fetch(`${base()}/api/chat/files/${ok.data.file.id}`, { headers: { Cookie: member.cookie() } })).status, 404);
});

test('every input has a size: members, lists, keys, names, mentions, files', async () => {
  const many = [ids.member, ids.other, ids.outsider, 'x1', 'x2'];
  assert.equal((await chat.makeChannel(member, ids.member, { members: many, keyed: [ids.member] })).status, 400);
  assert.equal((await chat.makeChannel(member, ids.member, { kind: 'group', members: [ids.member, ids.other, ids.outsider, 'x'], keyed: [ids.member] })).status, 400);
  assert.equal((await chat.makeChannel(member, ids.member, { metaCt: 'A'.repeat(9000) })).status, 400);
  const huge = chat.roster({ by: ids.member, members: [ids.member] });
  huge.roster = huge.roster.replace('"text":""', `"text":"","pad":"${'p'.repeat(70 * 1024)}"`);
  assert.equal((await member('POST', '/api/chat/channels', { id: chat.chatId(), kind: 'channel', members: [ids.member], metaCt: 'A'.repeat(40), ...huge })).status, 400);
  const url = `/api/chat/channels/${ids.channel}/messages`;
  assert.equal((await member('POST', url, chat.message(1, { files: Array.from({ length: 11 }, chat.chatId) }))).status, 400);
  assert.equal((await member('POST', url, chat.message(1, { ping: Array.from({ length: 101 }, (_, i) => `u${i}`) }))).status, 400);
  assert.equal((await member('GET', `${url}?limit=100000`)).status, 400);
  assert.equal((await member('GET', `${url}?thread=<script>`)).status, 400);
  const grants = { epoch: 2, ...chat.roster({ by: ids.member, members: [ids.member, ids.other] }) };
  grants.grants = Array.from({ length: 5001 }, () => ({ userId: ids.other, wrappedKey: 'A'.repeat(123) }));
  assert.equal((await member('POST', `/api/chat/channels/${ids.channel}/epochs`, grants)).status, 400);
});

test('someone outside a conversation can’t type into it or hear it', async () => {
  const inside = await socket(srv.base, other.cookie());
  const outside = await socket(srv.base, outsider.cookie());
  const ws = await socket(srv.base, outsider.cookie());
  await new Promise((r) => setTimeout(r, 100));
  // the outsider claims to type in the conversation; the member sends a message
  const raw = new (await import('ws')).default(`${srv.base.replace('http', 'ws')}/ws`, { headers: { Cookie: outsider.cookie() } });
  await new Promise((r) => raw.on('open', r));
  raw.send(JSON.stringify({ type: 'chat.typing', channelId: ids.channel }));
  await member('POST', `/api/chat/channels/${ids.channel}/messages`, chat.message(1));
  await new Promise((r) => setTimeout(r, 300));
  raw.close();
  assert.ok(!inside.events.some((e) => e.kind === 'typing'), 'nobody heard the outsider typing');
  assert.ok(inside.events.some((e) => e.type === 'chat' && e.kind === 'message'));
  assert.ok(!outside.events.some((e) => e.type === 'chat'), 'the outsider heard nothing');
  for (const s of [inside, outside, ws]) s.close();
});

test('floods are cut off: messages a minute and conversations an hour', async () => {
  const url = `/api/chat/channels/${ids.channel}/messages`;
  let status = 200;
  for (let i = 0; i < 25 && status !== 429; i++) status = (await other('POST', url, chat.message(1))).status;
  assert.equal(status, 429);
  let made = 200;
  for (let i = 0; i < 15 && made !== 429; i++) made = (await chat.makeChannel(other, ids.other, { members: [ids.other] })).status;
  assert.equal(made, 429);
});
