import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, entry, person, signIn, route, reset, confirm, b64u } from './helpers/fakeBrowser.js';

// What the audit asked of the browser: nothing is sealed to a key it hasn't confirmed, or while
// someone out of the conversation still holds its key, and a removed member's old key can't be
// used to slip in messages dated after they were out.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const startEpoch = await load('actions/chat/startEpoch');
const sealMessage = await load('actions/chat/sealMessage');
const openMessage = await load('actions/chat/openMessage');
const checkRoster = await load('actions/chat/checkRoster');
const chatRosters = await load('actions/chat/chatRosters');
const chatKeyring = await load('state/chatKeyring');
const sealGate = await load('actions/chat/sealGate');

const id = () => b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
const USERS = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }, { id: 'e', name: 'Eve' }];
let V, W, E;

beforeEach(async () => {
  reset();
  [V, W, E] = [person(), person(), person()];
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W), entry('e', E)]);
  chatRosters.clear();
  chatKeyring.wipe();
});

// A group Wen started with Vic and Eve, whose keys Wen confirmed; Vic has confirmed only Wen's.
async function group() {
  signIn('w', W, USERS);
  await confirm(['v', 'e']);
  const shape = { id: id(), kind: 'group', audience: 'people' };
  const made = await startEpoch(shape, 1, null, { members: ['v', 'w', 'e'], managers: ['v', 'w', 'e'] });
  signIn('v', V, USERS);
  await confirm(['w']);
  const mine = made.grants.find((g) => g.userId === 'v').wrappedKey;
  route('GET', `/api/chat/channels/${shape.id}/epochs?from=1`, () => ({ epochs: [{ epoch: 1, roster: made.raw, proofs: [], wrappedKeys: [mine] }] }));
  const row = { ...shape, epoch: 1, members: ['e', 'v', 'w'], keyHolders: ['e', 'v', 'w'], wrappedKeys: [mine], metaKeys: [], metaEpoch: null, purgedEpoch: 0, departures: [] };
  return { shape, made, row };
}

test('nothing is sealed until every key holder’s key is confirmed here', async () => {
  const { row } = await group();
  await assert.rejects(sealGate(row), /Check the keys/);
  await confirm(['e']);
  assert.ok(await sealGate(row));
});

test('nothing is sealed while someone out of the conversation still holds its key', async () => {
  const { row } = await group();
  await confirm(['e']);
  await assert.rejects(sealGate({ ...row, members: ['v', 'w'] }), /still holds/);
});

test('a removed member’s old key can’t carry messages dated after the next key started', async () => {
  const { shape, made, row } = await group();
  await confirm(['e']);
  const workspaceKey = store.get().workspaceKey;
  const first = await checkRoster(made.raw, { workspaceKey, channelId: shape.id, epoch: 1, wrappedKeys: row.wrappedKeys }, []);
  const next = await startEpoch(shape, 2, first, { members: ['v', 'w'], managers: ['v', 'w'] });
  const second = await checkRoster(next.raw, { workspaceKey, channelId: shape.id, epoch: 2, wrappedKeys: [] }, [first]);
  const chain = { rosters: [first, second], broken: null, forked: false, keysRev: 0 };
  signIn('e', E, USERS);
  const asEve = async (sentAt) => {
    const msgId = id();
    const bodyCt = await sealMessage({ id: msgId, channelId: shape.id, epoch: 1, sentAt, key: made.key, facts: { type: 'message', edit: 0, stream: 'eeeeeeeeeeeeeeee', n: 1, thread: null, ttl: null }, content: { text: 'hi' } });
    return { id: msgId, channelId: shape.id, seq: 1, threadId: null, kind: 'message', senderId: 'e', epoch: 1, sentAt, bodyCt, edits: 0, deleted: false, replies: 0, lastReplyAt: null, createdAt: 1, updatedAt: 1, expiresAt: null };
  };
  const before = await asEve(first.at);
  const later = await asEve(second.at + 60 * 60_000);
  signIn('v', V, USERS);
  await confirm(['w', 'e']);
  assert.equal((await openMessage(before, { ...row, epoch: 2 }, chain)).state, 'ok');
  assert.equal((await openMessage(later, { ...row, epoch: 2 }, chain)).state, 'unverified');
});
