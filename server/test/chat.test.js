import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import socket from './helpers/socket.js';
import until from './helpers/until.js';
import chat from './helpers/chatChannel.js';

// Chat as the server sees it: conversations, epochs, messages and reads, for members only. The
// server holds ciphertext and who is where; everything it refuses here it refuses whatever the
// browser says.
let srv;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const other = client(base);
const guest = client(base);
const ids = {};

before(async () => {
  srv = await startServer();
  const ow = wallet();
  ids.owner = (await owner.wallet(ow, 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' })).data.user.id;
  ids.project = (await owner('POST', '/api/projects', { name: 'Work' })).data.project.id;
  const join = async (c, role, extra = {}) => {
    const w = wallet();
    const inv = await owner('POST', '/api/invites', { role, ...extra });
    const id = (await c.wallet(w, 'invite', { name: `${role} ${Math.random()}`, inviteToken: inv.data.token })).data.user.id;
    return { id, w };
  };
  const m = await join(member, 'member');
  const o = await join(other, 'member');
  const g = await join(guest, 'guest', { projectIds: [ids.project] });
  Object.assign(ids, { member: m.id, other: o.id, guest: g.id });
  await publishKey(member, m.w);
  await publishKey(other, o.w);
  await publishKey(owner, ow);
});
after(() => srv.close());

test('only members reach chat: guests are turned away, and a conversation you’re not in doesn’t exist', async () => {
  assert.equal((await guest('GET', '/api/chat')).status, 403);
  const made = await chat.makeChannel(member, ids.member, { members: [ids.member] });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const id = made.data.channel.id;
  for (const [method, url, body] of [
    ['GET', `/api/chat/channels/${id}`],
    ['GET', `/api/chat/channels/${id}/messages`],
    ['GET', `/api/chat/channels/${id}/epochs`],
    ['POST', `/api/chat/channels/${id}/messages`, chat.message(1)],
    ['PUT', `/api/chat/channels/${id}/read`, { seq: 0 }],
    ['PATCH', `/api/chat/channels/${id}`, { disappearSeconds: 3600 }],
  ]) {
    assert.equal((await other(method, url, body)).status, 404, `${method} ${url}`);
  }
  assert.ok(!(await other('GET', '/api/chat')).data.channels.some((c) => c.id === id));
});

test('a conversation starts with a member list the server checks against what it’s told', async () => {
  // keys sealed to people not on the list, or a list naming someone not in it, are refused
  const r = chat.roster({ by: ids.member, members: [ids.member, ids.other] });
  const bad = await member('POST', '/api/chat/channels', { id: chat.chatId(), kind: 'channel', audience: 'people', members: [ids.member], metaCt: 'A'.repeat(40), ...r });
  assert.equal(bad.status, 400);
  const wrongSigner = chat.roster({ by: ids.other, members: [ids.member, ids.other] });
  assert.equal((await member('POST', '/api/chat/channels', { id: chat.chatId(), kind: 'group', members: [ids.other, ids.owner], ...wrongSigner })).status, 400);
  // a direct message is between two people, once
  const dm = await chat.makeChannel(member, ids.member, { kind: 'dm', members: [ids.member, ids.other] });
  assert.equal(dm.status, 200, JSON.stringify(dm.data));
  const again = await chat.makeChannel(other, ids.other, { kind: 'dm', members: [ids.member, ids.other] });
  assert.deepEqual([again.data.existing, again.data.channel.id], [true, dm.data.channel.id]);
  assert.equal((await chat.makeChannel(member, ids.member, { kind: 'dm', members: [ids.member, ids.other, ids.owner], keyed: [ids.member] })).status, 400);
  // guests and agents can't be in a conversation at all
  assert.equal((await chat.makeChannel(member, ids.member, { kind: 'group', members: [ids.member, ids.other, ids.guest], keyed: [ids.member, ids.other] })).status, 400);
  // a name has to be ciphertext
  assert.equal((await chat.makeChannel(member, ids.member, { metaCt: '<script>alert(1)</script>' })).status, 400);
});

test('messages: under the current key, from someone holding it, at the right time, within size', async () => {
  const { channel } = (await chat.makeChannel(member, ids.member, { members: [ids.member, ids.other], keyed: [ids.member, ids.other] })).data;
  const url = `/api/chat/channels/${channel.id}/messages`;
  const sent = await member('POST', url, chat.message(1));
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.message.seq, 1);
  assert.equal((await member('POST', url, chat.message(2))).status, 409, 'an epoch that isn’t current');
  assert.equal((await member('POST', url, chat.message(1, { sentAt: Date.now() - 3_600_000 }))).status, 400, 'a time far from now');
  assert.equal((await member('POST', url, chat.message(1, { ttl: 60 }))).status, 409, 'a disappearing setting the channel doesn’t have');
  assert.equal((await member('POST', url, chat.message(1, { bodyCt: 'A'.repeat(70 * 1024) }))).status, 400, 'over CHAT_MESSAGE_KB');
  assert.equal((await member('POST', url, chat.message(1, { id: '../../etc/passwd' }))).status, 400);
  assert.equal((await member('POST', url, chat.message(1, { id: sent.data.message.id }))).status, 409, 'an id used before');
  assert.equal((await member('POST', url, chat.message(1, { threadId: chat.chatId() }))).status, 400, 'a thread that doesn’t exist');
  // a thread, its replies counted on the first message
  const root = sent.data.message.id;
  assert.equal((await other('POST', url, chat.message(1, { threadId: root }))).status, 200);
  const thread = await member('GET', `${url}?thread=${root}`);
  assert.deepEqual(thread.data.messages.map((m) => m.threadId), [null, root]);
  const main = await member('GET', url);
  assert.deepEqual(main.data.messages.map((m) => [m.id, m.replies]), [[root, 1]]);
  // the other person has one unread top-level message until they read it
  const listed = (await other('GET', '/api/chat')).data.channels.find((c) => c.id === channel.id);
  assert.equal(listed.unread, 1);
  await other('PUT', `/api/chat/channels/${channel.id}/read`, { seq: listed.seq });
  assert.equal((await other('GET', `/api/chat/channels/${channel.id}`)).data.channel.unread, 0);
  assert.equal((await other('PUT', `/api/chat/channels/${channel.id}/read`, { seq: 9999 })).status, 400);
});

test('only the sender edits or deletes, one edit at a time, and a deletion stays as a tombstone', async () => {
  const { channel } = (await chat.makeChannel(member, ids.member, { members: [ids.member, ids.other], keyed: [ids.member, ids.other] })).data;
  const { message } = (await member('POST', `/api/chat/channels/${channel.id}/messages`, chat.message(1))).data;
  const edit = (c, body) => c('PUT', `/api/chat/messages/${message.id}`, { epoch: 1, bodyCt: 'B'.repeat(200), ...body });
  assert.equal((await edit(other, { edits: 1 })).status, 403);
  assert.equal((await edit(member, { edits: 2 })).status, 409);
  assert.equal((await edit(member, { edits: 1 })).data.message.edits, 1);
  const gone = await edit(member, { edits: 2, deleted: true });
  assert.equal(gone.data.message.deleted, true);
  assert.equal((await edit(member, { edits: 3 })).status, 400);
  assert.equal((await member('GET', `/api/chat/channels/${channel.id}/messages`)).data.messages.length, 1);
});

test('epochs: a member may start a new key for the same people; changing who is in it is for managers', async () => {
  const { channel } = (await chat.makeChannel(member, ids.member, { members: [ids.member, ids.other], keyed: [ids.member, ids.other] })).data;
  const url = `/api/chat/channels/${channel.id}/epochs`;
  const next = (by, members, extra = {}) => ({ epoch: 2, ...chat.roster({ by, members, managers: [ids.member] }), ...extra });
  assert.equal((await other('POST', url, next(ids.other, [ids.other]))).status, 403, 'leaving out someone who holds the key');
  assert.equal((await other('POST', url, next(ids.other, [ids.member, ids.other], { members: [ids.other] }))).status, 403, 'taking someone out');
  assert.equal((await other('POST', url, { ...next(ids.other, [ids.member, ids.other]), epoch: 3 })).status, 409);
  assert.equal((await other('POST', url, next(ids.member, [ids.member, ids.other]))).status, 400, 'a list signed as someone else');
  assert.equal((await other('POST', url, next(ids.other, [ids.member, ids.other]))).status, 200);
  // the manager takes the other person out with epoch 3; they lose the conversation, live
  const live = await socket(srv.base, other.cookie());
  const out = await member('POST', url, { epoch: 3, ...chat.roster({ by: ids.member, members: [ids.member] }), members: [ids.member] });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  await until(() => live.events.find((e) => e.type === 'chat' && e.channelId === channel.id && e.kind === 'epoch'), { what: 'the removed member’s tab hearing of it' });
  live.close();
  assert.equal((await other('GET', `/api/chat/channels/${channel.id}`)).status, 404);
  const epochs = (await member('GET', url)).data.epochs;
  assert.deepEqual(epochs.map((e) => e.epoch), [1, 2, 3]);
  assert.ok(epochs.every((e) => e.wrappedKey));
  // history keys go only to people in the conversation now, from someone who holds them
  const grant = { epoch: 1, grants: [{ userId: ids.other, wrappedKey: 'C'.repeat(123) }] };
  assert.equal((await member('POST', `/api/chat/channels/${channel.id}/grants`, grant)).status, 400);
});

test('disappearing messages: the setting is a manager’s, and expired messages are gone', async () => {
  const { channel } = (await chat.makeChannel(member, ids.member, { members: [ids.member, ids.other], keyed: [ids.member, ids.other] })).data;
  const url = `/api/chat/channels/${channel.id}`;
  assert.equal((await other('PATCH', url, { disappearSeconds: 3600 })).status, 403);
  assert.equal((await member('PATCH', url, { disappearSeconds: 10 })).status, 400);
  assert.equal((await member('PATCH', url, { disappearSeconds: 60 })).data.channel.disappearSeconds, 60);
  const sent = await member('POST', `${url}/messages`, chat.message(1, { ttl: 60 }));
  assert.ok(sent.data.message.expiresAt > Date.now());
  const { default: sql } = await import('../db/sql.js');
  sql.run('UPDATE chat_messages SET expires_at = ? WHERE id = ?', Date.now() - 1, sent.data.message.id);
  assert.equal((await member('GET', `${url}/messages`)).data.messages.length, 0, 'hidden before the sweep');
  const { default: sweepChat } = await import('../chat/sweepChat.js');
  assert.equal(sweepChat(), 1);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM chat_messages WHERE channel_id = ?', channel.id).n, 0);
});

test('a team channel includes every member and nobody leaves it; a group can be left', async () => {
  const team = await chat.makeChannel(owner, ids.owner, { audience: 'team', keyed: [ids.owner] });
  assert.equal(team.status, 200, JSON.stringify(team.data));
  assert.deepEqual(team.data.channel.members, [ids.owner, ids.member, ids.other].sort());
  assert.ok((await member('GET', '/api/chat')).data.channels.some((c) => c.id === team.data.channel.id));
  assert.equal((await member('POST', `/api/chat/channels/${team.data.channel.id}/leave`)).status, 400);
  assert.equal((await member('DELETE', `/api/chat/channels/${team.data.channel.id}`)).status, 403);
  const group = (await chat.makeChannel(member, ids.member, { kind: 'group', members: [ids.member, ids.other, ids.owner], keyed: [ids.member, ids.other] })).data.channel;
  assert.equal((await other('POST', `/api/chat/channels/${group.id}/leave`)).status, 200);
  assert.deepEqual((await member('GET', `/api/chat/channels/${group.id}`)).data.channel.members, [ids.member, ids.owner].sort());
  assert.equal((await owner('DELETE', `/api/chat/channels/${team.data.channel.id}`)).status, 200);
});
