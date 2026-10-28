import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import chat from './helpers/chatChannel.js';

// Chat keeping itself in bounds: each person's share of space, each person's sending tabs, a
// thread read by its own index, and conversations nobody can use any more going away.
let srv;
const base = () => srv.base;
const owner = client(base);
const ann = client(base);
const ben = client(base);
const ids = {};
const wallets = {};

before(async () => {
  srv = await startServer({ env: { CHAT_MEMBER_MB: '1', CHAT_MESSAGES_PER_MINUTE: '100', CHAT_EPOCHS_PER_PERSON_PER_DAY: '4' } });
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Olivia', workspaceName: 'Acme' })).data.user.id;
  for (const [c, key] of [[ann, 'ann'], [ben, 'ben']]) {
    wallets[key] = wallet();
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[key] = (await c.wallet(wallets[key], 'invite', { name: key, inviteToken: inv.data.token })).data.user.id;
    await publishKey(c, wallets[key]);
  }
});
after(() => srv.close());

const big = () => crypto.randomBytes(48 * 1024).toString('base64url');

test('a person’s sending tabs are capped per conversation, so nobody crowds out another’s marks', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben] })).data.channel;
  const url = `/api/chat/channels/${ch.id}/marks`;
  const mark = () => ({ epoch: 1, sentAt: Date.now(), bodyCt: 'M'.repeat(80) });
  await ben('PUT', `${url}/${'b'.repeat(16)}`, mark());
  for (let i = 0; i < 25; i++) await ann('PUT', `${url}/${`a${String(i).padStart(2, '0')}`.padEnd(16, 'x')}`, mark());
  const marks = (await ben('GET', url)).data.marks;
  assert.equal(marks.filter((m) => m.userId === ids.ann).length, 20);
  assert.ok(marks.some((m) => m.userId === ids.ben), 'Ben’s mark stays');
});

test('a thread comes from its own replies, with its first message once the page reaches it', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben] })).data.channel;
  const url = `/api/chat/channels/${ch.id}/messages`;
  const root = (await ann('POST', url, chat.message(1))).data.message.id;
  for (let i = 0; i < 3; i++) await ben('POST', url, chat.message(1, { threadId: root }));
  const all = (await ann('GET', `${url}?thread=${root}`)).data.messages;
  assert.deepEqual([all[0].id, all.length], [root, 4]);
  const newest = await ann('GET', `${url}?thread=${root}&limit=2`);
  assert.ok(newest.data.more && !newest.data.messages.some((m) => m.id === root), 'not until the start');
  const after = await ann('GET', `${url}?thread=${root}&after=${all[1].seq}`);
  assert.equal(after.data.messages.length, 2, 'catching up brings only what’s new');
});

test('each person keeps at most CHAT_MEMBER_MB of messages on the server', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben] })).data.channel;
  const url = `/api/chat/channels/${ch.id}/messages`;
  let refused = null;
  for (let i = 0; i < 20 && !refused; i++) {
    const res = await ann('POST', url, chat.message(1, { bodyCt: big() }));
    if (res.status !== 200) refused = res;
  }
  assert.equal(refused?.status, 413, 'a full share is refused');
  assert.equal((await ben('POST', url, chat.message(1))).status, 200, 'someone else’s share is their own');
});

test('a conversation whose key nobody holds any more goes, and a direct message lets go of its pair', async () => {
  const solo = (await chat.makeChannel(ben, ids.ben, { members: [ids.ben, ids.ann], keyed: [ids.ben] })).data.channel;
  const dm = (await chat.makeChannel(ann, ids.ann, { kind: 'dm', members: [ids.ann, ids.ben] })).data.channel;
  // Ben starts over with new keys: the channel only his old keys opened can't go on
  const reset = await publishKey(ben, wallets.ben, { reset: true, createdAt: Date.now() + 1000 });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.equal((await ann('GET', `/api/chat/channels/${solo.id}`)).status, 404);
  assert.equal((await ann('GET', `/api/chat/channels/${dm.id}`)).status, 200, 'Ann still holds the direct message’s key');
  const { default: sql } = await import('../db/sql.js');
  const { default: eraseUser } = await import('../services/eraseUser.js');
  eraseUser(ids.ben);
  assert.equal(sql.get('SELECT pair FROM chat_channels WHERE id = ?', dm.id).pair, null);
});

test('reading positions are rate limited like everything else', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann] })).data.channel;
  const codes = [];
  for (let i = 0; i < 110; i++) codes.push((await ann('PUT', `/api/chat/channels/${ch.id}/read`, { seq: 0 })).status);
  assert.ok(codes.includes(429));
});

test('someone handed older keys fetches only their copies; the checked lists stay as they are', async () => {
  const ch = (await chat.makeChannel(ann, ids.ann, { members: [ids.ann] })).data.channel;
  const page = (await ann('GET', `/api/chat/channels/${ch.id}/epochs?keys=1`)).data.epochs;
  assert.deepEqual(Object.keys(page[0]).sort(), ['epoch', 'wrappedKeys']);
});

test('each person starts only so many keys a day in one conversation, but leaving someone out is never held back', async () => {
  const join = async (name) => {
    const c = client(base);
    const w = wallet();
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    const id = (await c.wallet(w, 'invite', { name, inviteToken: inv.data.token })).data.user.id;
    await publishKey(c, w);
    return id;
  };
  const [dee, eve] = [await join('Dee'), await join('Eve')];
  const made = await chat.makeChannel(ann, ids.ann, { members: [ids.ann, dee, eve], managers: [ids.ann] });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const ch = made.data.channel;
  const url = `/api/chat/channels/${ch.id}/epochs`;
  const set = async (members) => ann('POST', url, { ...(await chat.next(ann, ch.id, { by: ids.ann, members, managers: [ids.ann] })), members });
  let refused = false;
  for (let i = 0; i < 5 && !refused; i++) {
    assert.equal((await set([ids.ann, eve])).status, 200, 'taking Dee out');
    refused = (await set([ids.ann, dee, eve])).status === 429;
  }
  assert.ok(refused, 'bringing her back stops at CHAT_EPOCHS_PER_PERSON_PER_DAY');
  assert.equal((await set([ids.ann])).status, 200, 'taking Eve out still goes through');
});
