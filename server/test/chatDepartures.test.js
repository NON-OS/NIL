import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import chat from './helpers/chatChannel.js';

// The second round of chat on the server: departures any member can cite, history keys kept per
// giver, tabs' high-water marks, tombstones for messages given up on, and forward-secret
// conversations that let go of old keys.
let srv;
const base = () => srv.base;
const owner = client(base);
const ann = client(base);
const ben = client(base);
const cat = client(base);
const ids = {};

before(async () => {
  srv = await startServer();
  const ow = wallet();
  ids.owner = (await owner.wallet(ow, 'setup', { name: 'Olivia', workspaceName: 'Acme' })).data.user.id;
  await publishKey(owner, ow);
  for (const [c, key] of [[ann, 'ann'], [ben, 'ben'], [cat, 'cat']]) {
    const w = wallet();
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[key] = (await c.wallet(w, 'invite', { name: key, inviteToken: inv.data.token })).data.user.id;
    await publishKey(c, w);
  }
});
after(() => srv.close());

const group = async () => (await chat.makeChannel(ann, ids.ann, { kind: 'group', members: [ids.ann, ids.ben, ids.cat] })).data.channel;
const next = async (call, channelId, by, members, extra = {}) => ({ ...(await chat.next(call, channelId, { by, members, managers: members })), ...extra });

test('a member who leaves signs it, and any member may then start a key without them, citing it', async () => {
  const g = await group();
  const url = `/api/chat/channels/${g.id}`;
  const statement = chat.statement(ids.cat, { channelId: g.id });
  assert.equal((await cat('POST', `${url}/leave`, { statement: chat.statement(ids.ann, { channelId: g.id }) })).status, 400, 'a statement signed as someone else');
  const forged = JSON.stringify({ ...JSON.parse(statement), sig: JSON.parse(chat.statement(ids.ann, { channelId: g.id })).sig });
  assert.equal((await cat('POST', `${url}/leave`, { statement: forged })).status, 400, 'a signature that isn’t hers');
  assert.equal((await cat('POST', `${url}/leave`, { statement: chat.statement(ids.cat, { channelId: chat.chatId() }) })).status, 400, 'signed for another conversation');
  assert.equal((await cat('POST', `${url}/leave`, { statement })).status, 200);
  const listed = (await ben('GET', url)).data.channel;
  assert.deepEqual(listed.departures, [{ userId: ids.cat, statement }]);
  // everyone in a group manages it, so Ben may start the next key without her
  assert.equal((await ben('POST', `${url}/epochs`, await next(ben, g.id, ids.ben, [ids.ann, ids.ben]))).status, 200);
  assert.equal((await cat('GET', url)).status, 404);
});

test('in a channel, only a manager or a member citing signed departures can leave someone out', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben, ids.cat], managers: [ids.ann] })).data.channel;
  const url = `/api/chat/channels/${ch.id}`;
  const roster = (members) => chat.next(ben, ch.id, { by: ids.ben, members, managers: [ids.ann] });
  const statement = chat.statement(ids.cat, { channelId: ch.id });
  await cat('POST', `${url}/leave`, { statement });
  assert.equal((await ben('POST', `${url}/epochs`, (await roster([ids.ann, ids.ben])))).status, 403, 'no proof cited');
  assert.equal((await ben('POST', `${url}/epochs`, { ...(await roster([ids.ann, ids.ben])), proofs: [chat.statement(ids.cat, { channelId: ch.id })] })).status, 403, 'a proof the server doesn’t hold');
  assert.equal((await ben('POST', `${url}/epochs`, { ...(await roster([ids.ben])), proofs: [statement] })).status, 403, 'Ann never left');
  const ok = await ben('POST', `${url}/epochs`, { ...(await roster([ids.ann, ids.ben])), proofs: [statement] });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const epochs = (await ann('GET', `${url}/epochs`)).data.epochs;
  assert.deepEqual(epochs[1].proofs, [statement]);
});

test('history keys are kept per giver, so a bad copy can’t crowd out a good one', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben, ids.cat], keyed: [ids.ann, ids.ben], managers: [ids.ann] })).data.channel;
  const url = `/api/chat/channels/${ch.id}`;
  const give = (c, wrappedKey) => c('POST', `${url}/grants`, { epoch: 1, grants: [{ userId: ids.cat, wrappedKey }] });
  assert.equal((await give(cat, 'C'.repeat(123))).status, 403, 'Cat holds no key for epoch 1');
  assert.equal((await give(ben, 'B'.repeat(123))).status, 200);
  assert.equal((await give(ann, 'A'.repeat(123))).status, 200);
  const wraps = (await cat('GET', `${url}/epochs`)).data.epochs[0].wrappedKeys;
  assert.deepEqual(wraps.sort(), ['A'.repeat(123), 'B'.repeat(123)]);
});

test('marks move forward only, and each is filed under its own sender', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben] })).data.channel;
  const url = `/api/chat/channels/${ch.id}/marks`;
  const mark = (sentAt) => ({ epoch: 1, sentAt, bodyCt: 'M'.repeat(80) });
  const now = Date.now();
  assert.equal((await ann('PUT', `${url}/aaaaaaaaaaaaaaaa`, mark(now))).status, 200);
  assert.equal((await ann('PUT', `${url}/aaaaaaaaaaaaaaaa`, mark(now - 1000))).status, 200);
  // Ben using the same stream name files a mark of his own, which can't touch Ann's
  assert.equal((await ben('PUT', `${url}/aaaaaaaaaaaaaaaa`, mark(now + 10))).status, 200);
  assert.equal((await ann('PUT', `${url}/bad`, mark(now))).status, 400);
  assert.equal((await ann('PUT', `${url}/bbbbbbbbbbbbbbbb`, { ...mark(now), epoch: 2 })).status, 409);
  const marks = (await ben('GET', url)).data.marks;
  assert.deepEqual(marks.map((m) => [m.userId, m.sentAt]).sort(), [[ids.ann, now], [ids.ben, now + 10]].sort());
  assert.equal((await cat('GET', url)).status, 404);
});

test('a message given up on goes as a tombstone, which nobody is notified of or counts as unread', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben] })).data.channel;
  const sent = await ann('POST', `/api/chat/channels/${ch.id}/messages`, chat.message(1, { deleted: true }));
  assert.equal(sent.data.message.deleted, true);
  assert.equal((await ben('GET', `/api/chat/channels/${ch.id}`)).data.channel.unread, 0);
});

test('a forward-secret conversation lets go of old keys and what was sealed under them', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben], managers: [ids.ann] })).data.channel;
  const url = `/api/chat/channels/${ch.id}`;
  const signed = (forwardDays) => ({ metaCt: 'N'.repeat(60), metaEpoch: 1, forwardDays });
  assert.equal((await ben('PATCH', url, signed(1))).status, 403);
  assert.equal((await ann('PATCH', url, signed(0))).status, 400);
  assert.equal((await ann('PATCH', url, signed(1))).data.channel.forwardDays, 1);
  await ann('POST', `${url}/messages`, chat.message(1));
  await ann('POST', `${url}/epochs`, await chat.next(ann, ch.id, { by: ids.ann, members: [ids.ann, ids.ben] }));
  await ann('POST', `${url}/messages`, chat.message(2));
  // the name's key is kept until the name is sealed under a newer one
  await ann('PATCH', url, { metaCt: 'N'.repeat(60), metaEpoch: 2 });
  const { default: sql } = await import('../db/sql.js');
  const { default: purgeOldKeys } = await import('../chat/purgeOldKeys.js');
  assert.equal(purgeOldKeys(Date.now()), 0, 'epoch 1 ended just now');
  assert.equal(purgeOldKeys(Date.now() + 2 * 86_400_000), 1);
  const epochs = (await ann('GET', `${url}/epochs`)).data.epochs;
  assert.deepEqual(epochs.map((e) => e.wrappedKeys.length), [0, 1]);
  assert.deepEqual((await ann('GET', `${url}/messages`)).data.messages.map((m) => m.epoch), [2]);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM chat_epoch_keys WHERE channel_id = ? AND epoch = 1', ch.id).n, 0);
  assert.equal((await ann('POST', `${url}/grants`, { epoch: 1, grants: [] })).status, 400, 'a purged key can’t be handed on');
});

test('an admin signs that someone left the team, and only for someone who did', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben], managers: [ids.ann] })).data.channel;
  assert.equal((await ann('POST', '/api/chat/removals', { userId: ids.ben, statement: chat.statement(ids.ann, { userId: ids.ben }) })).status, 403, 'members can’t');
  assert.equal((await owner('POST', '/api/chat/removals', { userId: ids.ben, statement: chat.statement(ids.owner, { userId: ids.ben }) })).status, 400, 'Ben is still on the team');
  await owner('PATCH', `/api/users/${ids.ben}`, { deactivated: true });
  assert.equal((await owner('POST', '/api/chat/removals', { userId: ids.ben, statement: chat.statement(ids.owner, { userId: ids.cat }) })).status, 400, 'names someone else');
  const statement = chat.statement(ids.owner, { userId: ids.ben });
  assert.equal((await owner('POST', '/api/chat/removals', { userId: ids.ben, statement })).status, 200);
  assert.deepEqual((await ann('GET', `/api/chat/channels/${ch.id}`)).data.channel.departures, [{ userId: ids.ben, statement }]);
});

test('back on the team, a signed removal from before no longer counts', async () => {
  const { default: sql } = await import('../db/sql.js');
  await owner('PATCH', `/api/users/${ids.ben}`, { deactivated: false });
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM chat_departures WHERE user_id = ? AND channel_id IS NULL', ids.ben).n, 0);
});

test('one person can make only so many channels for the whole team', async () => {
  const { default: sql } = await import('../db/sql.js');
  const made = [];
  for (let i = 0; i < 26; i++) made.push((await chat.makeChannel(cat, ids.cat, { audience: 'team', keyed: [ids.cat] })).status);
  assert.ok(made.includes(400), 'refused past CHAT_TEAM_CHANNELS_PER_PERSON');
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM chat_channels WHERE audience = 'team' AND created_by = ?", ids.cat).n, 25);
});

test('a leaving from an earlier stay doesn’t count once someone is back in', async () => {
  const dan = client(base);
  const w = wallet();
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const danId = (await dan.wallet(w, 'invite', { name: 'dan', inviteToken: inv.data.token })).data.user.id;
  await publishKey(dan, w);
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.cat, danId], managers: [ids.ann] })).data.channel;
  const url = `/api/chat/channels/${ch.id}`;
  const old = chat.statement(danId, { channelId: ch.id, at: Date.now() - 1000 });
  assert.equal((await dan('POST', `${url}/leave`, { statement: old })).status, 200);
  // Ann, who manages it, leaves Dan out, then brings him back
  assert.equal((await ann('POST', `${url}/epochs`, await chat.next(ann, ch.id, { by: ids.ann, members: [ids.ann, ids.cat], managers: [ids.ann] }))).status, 200);
  assert.equal((await ann('POST', `${url}/epochs`, { ...(await chat.next(ann, ch.id, { by: ids.ann, members: [ids.ann, ids.cat, danId], managers: [ids.ann] })), members: [ids.ann, ids.cat, danId] })).status, 200);
  await owner('PATCH', `/api/users/${danId}`, { deactivated: true });
  // Cat, who doesn't manage it, can't use Dan's old leaving to drop him now
  const drop = await cat('POST', `${url}/epochs`, { ...(await chat.next(cat, ch.id, { by: ids.cat, members: [ids.ann, ids.cat], managers: [ids.ann] })), proofs: [old] });
  assert.equal(drop.status, 403, JSON.stringify(drop.data));
  assert.match(drop.data.error, /signed leaving/);
});

test('someone made a guest is in no conversation, and isn’t brought back into one by becoming a member again', async () => {
  const fay = client(base);
  const w = wallet();
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const fayId = (await fay.wallet(w, 'invite', { name: 'fay', inviteToken: inv.data.token })).data.user.id;
  await publishKey(fay, w);
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, fayId], managers: [ids.ann] })).data.channel;
  assert.equal((await owner('PATCH', `/api/users/${fayId}`, { role: 'guest' })).status, 200);
  assert.equal((await owner('PATCH', `/api/users/${fayId}`, { role: 'member' })).status, 200);
  assert.deepEqual((await ann('GET', `/api/chat/channels/${ch.id}`)).data.channel.members, [ids.ann]);
});
