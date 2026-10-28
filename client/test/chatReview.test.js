import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, entry, person, signIn, route, reset, confirm, b64u } from './helpers/fakeBrowser.js';

// What the second security review asked for: a server can't bring a deleted message back in a new
// tab, can't change a conversation's signed settings unnoticed, and can't answer "start a direct
// message with Bob" with a conversation that seals to someone else.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const startEpoch = await load('actions/chat/startEpoch');
const sealMessage = await load('actions/chat/sealMessage');
const openMessage = await load('actions/chat/openMessage');
const checkRoster = await load('actions/chat/checkRoster');
const chatMeta = await load('actions/chat/chatMeta');
const chatChannels = await load('actions/chat/chatChannels');
const chatRosters = await load('actions/chat/chatRosters');
const chatKeyring = await load('state/chatKeyring');

const id = () => b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
let V, W, E;

beforeEach(async () => {
  reset();
  [V, W, E] = [person(), person(), person()];
  signIn('v', V, [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }, { id: 'e', name: 'Eve' }]);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W), entry('e', E)]);
  await confirm(['w']);
  chatRosters.clear();
  chatKeyring.wipe();
});

async function group() {
  const shape = { id: id(), kind: 'group', audience: 'people' };
  const made = await startEpoch(shape, 1, null, { members: ['v', 'w'], managers: ['v', 'w'] });
  const roster = await checkRoster(made.raw, { workspaceKey: store.get().workspaceKey, channelId: shape.id, epoch: 1, wrappedKeys: [made.grants[0].wrappedKey] }, []);
  const chain = { rosters: [roster], broken: null, forked: false, keysRev: 0 };
  const row = { ...shape, epoch: 1, wrappedKeys: [], metaKeys: [], metaEpoch: 1, purgedEpoch: 0 };
  return { shape, made, chain, row };
}

test('a message seen deleted doesn’t come back, even in a later tab', async () => {
  const { shape, made, chain, row } = await group();
  const sentAt = Date.now();
  const msgId = id();
  const seal = (type, edit, content) => sealMessage({ id: msgId, channelId: shape.id, epoch: 1, sentAt, key: made.key, facts: { type, edit, stream: 'eeeeeeeeeeeeeeee', n: 1, thread: null, ttl: null }, content });
  const asRow = (bodyCt, edits, deleted) => ({ id: msgId, channelId: shape.id, seq: 1, threadId: null, kind: 'message', senderId: 'v', epoch: 1, sentAt, bodyCt, edits, deleted, replies: 0, lastReplyAt: null, createdAt: 1, updatedAt: 1, expiresAt: null });
  const original = asRow(await seal('message', 0, { text: 'the old plan' }), 0, false);
  const deleted = asRow(await seal('deleted', 1, {}), 1, true);
  assert.equal((await openMessage(deleted, row, chain)).type, 'deleted');
  // a fresh tab: nothing in memory, only what this browser recorded
  assert.equal((await openMessage(original, row, chain)).state, 'unverified');
});

test('settings are signed with the name, so a server that changes them is caught', async () => {
  const { shape, made, chain, row } = await group();
  const metaCt = await chatMeta.seal(made.key, shape.id, 1, { name: 'Night shift', disappear: 3600, forward: 7 });
  const meta = await chatMeta.open({ ...row, metaCt }, chain);
  assert.deepEqual([meta.name, meta.signedSettings], ['Night shift', { disappear: 3600, forward: 7 }]);
});

test('a direct message the server says exists has to be with the person asked for', async () => {
  // the server's answer: an existing conversation signed by Eve, holding Vic and Eve
  signIn('e', E, [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }, { id: 'e', name: 'Eve' }]);
  await confirm(['v']);
  const shape = { id: id(), kind: 'dm', audience: 'people' };
  const made = await startEpoch(shape, 1, null, { members: ['e', 'v'], managers: ['e', 'v'] });
  signIn('v', V, [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }, { id: 'e', name: 'Eve' }]);
  const fake = { ...shape, createdBy: 'e', createdAt: 1, lastAt: 1, seq: 0, readSeq: 0, unread: 0, epoch: 1, epochAt: 1, rotateAt: null, metaCt: null, metaEpoch: null, disappearSeconds: null, members: ['v', 'w'], keyHolders: ['e', 'v'], wrappedKeys: [made.grants.find((g) => g.userId === 'v').wrappedKey], metaKeys: [], departures: [], forwardDays: null, purgedEpoch: 0, notify: 'default' };
  route('POST', '/api/chat/channels', () => ({ channel: fake, existing: true }));
  route('GET', /\/epochs/, () => ({ epochs: [{ epoch: 1, roster: made.raw, proofs: [], wrappedKeys: fake.wrappedKeys }] }));
  await assert.rejects(chatChannels.create({ kind: 'dm', people: ['w'] }), /isn’t the people you picked/);
});
