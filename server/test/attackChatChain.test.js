import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import chat from './helpers/chatChannel.js';

// A member trying to file a member list or a departure that every browser would refuse, which
// would stall the conversation for everyone: forged or misplaced signatures, a list that doesn't
// follow the one before it, one dated before it, or one changing who manages it without the say.
let srv;
const base = () => srv.base;
const ann = client(base);
const ben = client(base);
const ids = {};

before(async () => {
  srv = await startServer({ env: { CHAT_KEY_CHANGES_PER_MINUTE: '12' } });
  const owner = client(base);
  await owner.wallet(wallet(), 'setup', { name: 'Olivia', workspaceName: 'Acme' });
  for (const [c, key] of [[ann, 'ann'], [ben, 'ben']]) {
    const w = wallet();
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[key] = (await c.wallet(w, 'invite', { name: key, inviteToken: inv.data.token })).data.user.id;
    await publishKey(c, w);
  }
});
after(() => srv.close());

const channel = async () => (await chat.makeChannel(ann, ids.ann, { members: [ids.ann, ids.ben], managers: [ids.ann] })).data.channel;
const resign = (raw, change) => JSON.stringify({ ...JSON.parse(raw), ...change });

test('a list whose signature isn’t its signer’s, or is for another place, is refused', async () => {
  const ch = await channel();
  const url = `/api/chat/channels/${ch.id}/epochs`;
  const good = await chat.next(ben, ch.id, { by: ids.ben, members: [ids.ann, ids.ben], managers: [ids.ann] });
  const facts = JSON.parse(good.roster).facts;
  assert.equal((await ben('POST', url, { ...good, roster: resign(good.roster, { facts: [...facts.slice(0, 6), facts[6] + 1] }) })).status, 400, 'facts changed after signing');
  assert.equal((await ben('POST', url, { ...good, roster: resign(good.roster, { sig: `${JSON.parse(good.roster).sig}A` }) })).status, 400, 'a signature of the wrong length');
  const forged = chat.roster({ by: ids.ben, signedBy: ids.ann, channelId: ch.id, epoch: 2, prev: (await ben('GET', url)).data.epochs[0].roster, members: [ids.ann, ids.ben], managers: [ids.ann] });
  assert.equal((await ben('POST', url, { epoch: 2, ...forged })).status, 400, 'signed by someone else’s key');
  const elsewhere = await chat.next(ben, ch.id, { by: ids.ben, members: [ids.ann, ids.ben], managers: [ids.ann] });
  const other = await channel();
  assert.equal((await ben('POST', `/api/chat/channels/${other.id}/epochs`, elsewhere)).status, 400, 'signed for another conversation');
  assert.equal((await ben('POST', url, good)).status, 200);
});

test('a list has to follow the one before it, after it, and keep who manages it', async () => {
  const ch = await channel();
  const url = `/api/chat/channels/${ch.id}/epochs`;
  const first = (await ben('GET', url)).data.epochs[0].roster;
  const stray = chat.roster({ by: ids.ben, channelId: ch.id, epoch: 2, prev: resign(first, { sig: 'x' }), members: [ids.ann, ids.ben], managers: [ids.ann] });
  assert.equal((await ben('POST', url, { epoch: 2, ...stray })).status, 409, 'pointing at a list that isn’t the last');
  const old = chat.roster({ by: ids.ben, channelId: ch.id, epoch: 2, prev: first, members: [ids.ann, ids.ben], managers: [ids.ann], at: JSON.parse(first).facts[6] });
  assert.equal((await ben('POST', url, { epoch: 2, ...old })).status, 409, 'dated no later than the list before');
  const future = chat.roster({ by: ids.ben, channelId: ch.id, epoch: 2, prev: first, members: [ids.ann, ids.ben], managers: [ids.ann], at: Date.now() + 86_400_000 });
  assert.equal((await ben('POST', url, { epoch: 2, ...future })).status, 400, 'dated a day ahead');
  const seized = await chat.next(ben, ch.id, { by: ids.ben, members: [ids.ann, ids.ben], managers: [ids.ann, ids.ben] });
  assert.equal((await ben('POST', url, seized)).status, 403, 'naming himself a manager');
  assert.equal((await ann('POST', url, await chat.next(ann, ch.id, { by: ids.ann, members: [ids.ann, ids.ben], managers: [ids.ann, ids.ben] }))).status, 200, 'the manager may');
});

test('a direct message keeps its two people and can start over, and departures carry a real signature', async () => {
  const dm = (await chat.makeChannel(ann, ids.ann, { kind: 'dm', members: [ids.ann, ids.ben] })).data.channel;
  const g = await channel();
  assert.equal((await ann('POST', `/api/chat/channels/${dm.id}/epochs`, await chat.next(ann, dm.id, { by: ids.ann, members: [ids.ann, ids.ben] }))).status, 200);
  assert.equal((await ann('POST', `/api/chat/channels/${g.id}/start-over`)).status, 400, 'only a direct message starts over');
  assert.equal((await ben('POST', `/api/chat/channels/${dm.id}/start-over`)).status, 200);
  const fresh = await chat.makeChannel(ann, ids.ann, { kind: 'dm', members: [ids.ann, ids.ben] });
  assert.ok(!fresh.data.existing && fresh.data.channel.id !== dm.id, 'a fresh one starts');
  assert.equal((await ann('GET', `/api/chat/channels/${dm.id}`)).status, 200, 'the old one stays');
  const leave = chat.statement(ids.ben, { channelId: g.id });
  assert.equal((await ben('POST', `/api/chat/channels/${g.id}/leave`, { statement: resign(leave, { facts: [Date.now() + 86_400_000] }) })).status, 400);
  assert.equal((await ben('POST', `/api/chat/channels/${g.id}/leave`, { statement: leave })).status, 200);
});
