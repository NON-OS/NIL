import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, entry, person, signIn, route, reset, confirm, b64u } from './helpers/fakeBrowser.js';

// Chat as a dishonest server would serve it: keys swapped for its own, member lists and
// messages signed by someone who isn't allowed, messages moved between conversations, and keys
// sealed to people nobody confirmed. Each must be caught in the browser.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const startEpoch = await load('actions/chat/startEpoch');
const checkRoster = await load('actions/chat/checkRoster');
const sealMessage = await load('actions/chat/sealMessage');
const openMessage = await load('actions/chat/openMessage');
const chatKeys = await load('actions/chat/chatKeys');
const chatMeta = await load('actions/chat/chatMeta');
const chatKeyring = await load('state/chatKeyring');
const chatKeySeal = await load('lib/crypto/chatKeySeal');
const keyHash = await load('lib/crypto/keyHash');
const signedFacts = await load('lib/crypto/signedFacts');
const chatRoster = await load('lib/crypto/chatRoster');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }, { id: 'x', name: 'Xan' }];
const id = () => b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
let V, W, X, entries;

beforeEach(async () => {
  reset();
  [V, W, X] = [person(), person(), person()];
  entries = [entry('v', V), entry('w', W), entry('x', X)];
  route('GET', '/api/encryption-keys', () => entries);
  signIn('v', V, users);
  await confirm(['w']);
});

const as = async (who, identity) => {
  chatKeyring.wipe();
  signIn(who, identity, users);
};

// A channel V makes for V and W, its first epoch's list checked, and the chain as W sees it.
async function channelOfTwo(kind = 'channel') {
  const shape = { id: id(), kind, audience: 'people' };
  const made = await startEpoch(shape, 1, null, { members: ['v', 'w'], managers: ['v'] });
  const row = (wrappedKey) => ({ ...shape, epoch: 1, members: ['v', 'w'], keyHolders: ['v', 'w'], wrappedKeys: [wrappedKey], metaKeys: [], departures: [], purgedEpoch: 0, forwardDays: null, metaCt: null, metaEpoch: null, createdBy: 'v', rotateAt: null, disappearSeconds: null });
  return { shape, made, row };
}

const chainFor = async (shape, raw, wrappedKey, prev = null, epoch = 1) => {
  const roster = await checkRoster(raw, { workspaceKey: store.get().workspaceKey, channelId: shape.id, epoch, wrappedKeys: wrappedKey ? [wrappedKey] : [] }, prev ? [prev] : []);
  return { rosters: [...(prev ? [prev] : []), roster], broken: null, forked: false, keysRev: 0 };
};

async function sealed(shape, key, { epoch = 1, sender = 'v', text = 'hello', n = 1, edit = 0, type = 'message', thread = null } = {}) {
  const m = { id: id(), sentAt: Date.now() };
  const bodyCt = await sealMessage({ id: m.id, channelId: shape.id, epoch, sentAt: m.sentAt, key, facts: { type, edit, stream: 'stream-aaaaaaaaa', n, thread, ttl: null }, content: { text } });
  return { id: m.id, channelId: shape.id, seq: n, threadId: thread, kind: type === 'reaction' ? 'reaction' : 'message', senderId: sender, epoch, sentAt: m.sentAt, bodyCt, edits: edit, deleted: type === 'deleted', replies: 0, lastReplyAt: null, createdAt: m.sentAt, updatedAt: m.sentAt, expiresAt: null };
}

test('a message from a member opens for the other, signed and under the listed key', async () => {
  const { shape, made, row } = await channelOfTwo();
  assert.deepEqual(made.roster.members, ['v', 'w']);
  const msg = await sealed(shape, made.key);
  const forW = made.grants.find((g) => g.userId === 'w').wrappedKey;
  await as('w', W);
  const chain = await chainFor(shape, made.raw, forW);
  const opened = await openMessage(msg, row(forW), chain);
  assert.deepEqual([opened.state, opened.text, opened.senderId, opened.n], ['ok', 'hello', 'v', 1]);
});

test('a key the server sealed in place of the listed one is refused', async () => {
  const { shape, made, row } = await channelOfTwo();
  const msg = await sealed(shape, made.key);
  // the server's own key, sealed to W's real public key: it decrypts, but isn't the listed one
  const swapped = await chatKeySeal.seal(crypto.getRandomValues(new Uint8Array(32)), W.publicKey);
  await as('w', W);
  const chain = await chainFor(shape, made.raw, swapped);
  await assert.rejects(chatKeys.get(row(swapped), chain, 1), /isn’t the one its members were given/);
  assert.equal((await openMessage(msg, row(swapped), chain)).state, 'unverified');
});

test('a message signed by someone not on the epoch’s list, or shown under another sender, doesn’t open', async () => {
  const { shape, made, row } = await channelOfTwo();
  const forW = made.grants.find((g) => g.userId === 'w').wrappedKey;
  // X somehow holds the key (a former member, or the server) and writes as X
  await as('x', X);
  const fromX = await sealed(shape, made.key, { sender: 'x' });
  await as('v', V);
  const fromV = await sealed(shape, made.key);
  await as('w', W);
  const chain = await chainFor(shape, made.raw, forW);
  assert.equal((await openMessage(fromX, row(forW), chain)).state, 'unverified');
  assert.equal((await openMessage({ ...fromV, senderId: 'w' }, row(forW), chain)).state, 'unverified');
  assert.equal((await openMessage({ ...fromV, sentAt: fromV.sentAt + 1 }, row(forW), chain)).state, 'unverified');
  assert.equal((await openMessage({ ...fromV, channelId: id() }, { ...row(forW), id: id() }, chain)).state, 'unverified');
  assert.equal((await openMessage({ ...fromV, threadId: id() }, row(forW), chain)).state, 'unverified');
  assert.equal((await openMessage(fromV, row(forW), chain)).state, 'ok');
});

test('an older edit served after a newer one is caught', async () => {
  const { shape, made, row } = await channelOfTwo();
  const forW = made.grants.find((g) => g.userId === 'w').wrappedKey;
  const first = await sealed(shape, made.key, { text: 'v1' });
  const second = { ...(await sealed(shape, made.key, { text: 'v2', edit: 1 })), id: first.id };
  // re-seal the edit under the first message's id and time, as the sender's browser does
  second.bodyCt = await sealMessage({ id: first.id, channelId: shape.id, epoch: 1, sentAt: first.sentAt, key: made.key, facts: { type: 'message', edit: 1, stream: 'stream-aaaaaaaaa', n: 1, thread: null, ttl: null }, content: { text: 'v2' } });
  second.sentAt = first.sentAt;
  await as('w', W);
  const chain = await chainFor(shape, made.raw, forW);
  assert.equal((await openMessage(second, row(forW), chain)).text, 'v2');
  assert.equal((await openMessage(first, row(forW), chain)).state, 'unverified');
});

test('keys are sealed only to confirmed people, and the list says exactly who got one', async () => {
  // X's key was never confirmed here
  const { made } = await (async () => {
    const shape = { id: id(), kind: 'group', audience: 'people' };
    return { made: await startEpoch(shape, 1, null, { members: ['v', 'w', 'x'], managers: ['v', 'w', 'x'] }) };
  })();
  assert.deepEqual(made.grants.map((g) => g.userId).sort(), ['v', 'w']);
  assert.deepEqual(made.roster.members, ['v', 'w']);
  assert.deepEqual(made.roster.managers, ['v', 'w']);
  // a key that changed after it was confirmed stops getting keys until it's confirmed again
  const W2 = person();
  entries = [entry('v', V), entry('w', W2), entry('x', X)];
  store.set((s) => ({ keysRev: s.keysRev + 1 }));
  const again = await startEpoch({ id: id(), kind: 'group', audience: 'people' }, 1, null, { members: ['v', 'w'], managers: ['v', 'w'] });
  assert.deepEqual(again.roster.members, ['v']);
});

test('only a manager can take someone out, and nobody can rewrite the chain', async () => {
  const { shape, made } = await channelOfTwo();
  const ws = store.get().workspaceKey;
  const first = await checkRoster(made.raw, { workspaceKey: ws, channelId: shape.id, epoch: 1, wrappedKeys: [] }, []);
  // W isn't a manager: a new key for the same people is fine, dropping V isn't
  await as('w', W);
  await confirm(['v']);
  const same = await startEpoch(shape, 2, first, { members: ['v', 'w'], managers: ['v'] });
  assert.equal((await checkRoster(same.raw, { workspaceKey: ws, channelId: shape.id, epoch: 2, wrappedKeys: [] }, [first])).by, 'w');
  const drop = await startEpoch(shape, 2, first, { members: ['w'], managers: [] });
  await assert.rejects(checkRoster(drop.raw, { workspaceKey: ws, channelId: shape.id, epoch: 2, wrappedKeys: [] }, [first]), /wasn’t allowed/);
  // V, the manager, may take W out
  await as('v', V);
  const out = await startEpoch(shape, 2, first, { members: ['v'], managers: ['v'] });
  assert.deepEqual((await checkRoster(out.raw, { workspaceKey: ws, channelId: shape.id, epoch: 2, wrappedKeys: [] }, [first])).members, ['v']);
  // a list that skips back to another chain, or sits at another epoch or conversation, fails
  const elsewhere = await startEpoch({ ...shape, id: id() }, 2, first, { members: ['v', 'w'], managers: ['v'] });
  await assert.rejects(checkRoster(elsewhere.raw, { workspaceKey: ws, channelId: shape.id, epoch: 2, wrappedKeys: [] }, [first]));
  await assert.rejects(checkRoster(out.raw, { workspaceKey: ws, channelId: shape.id, epoch: 3, wrappedKeys: [] }, [first]));
  await assert.rejects(checkRoster(out.raw, { workspaceKey: ws, channelId: shape.id, epoch: 2, wrappedKeys: [] }, [{ ...first, hash: 'A'.repeat(43) }]));
});

test('a member list signed with a key nobody can see for its signer is refused', async () => {
  const shape = { id: id(), kind: 'channel', audience: 'people' };
  const ghost = person();
  const facts = { kind: 'channel', audience: 'people', members: ['v', 'z'], managers: ['z'], key: keyHash(crypto.getRandomValues(new Uint8Array(32))), prev: null, at: Date.now() };
  const raw = signedFacts.seal('', { kind: chatRoster.kind, place: chatRoster.place(store.get().workspaceKey, shape.id, 1), facts: chatRoster.list(facts), by: 'z', signingPrivate: ghost.signingPrivate });
  await assert.rejects(checkRoster(raw, { workspaceKey: store.get().workspaceKey, channelId: shape.id, epoch: 1, wrappedKeys: [] }, []), /can’t confirm/);
});

test('a channel name set by someone who doesn’t manage it isn’t shown', async () => {
  const { shape, made, row } = await channelOfTwo();
  const forW = made.grants.find((g) => g.userId === 'w').wrappedKey;
  const named = await chatMeta.seal(made.key, shape.id, 1, { name: 'Payroll', topic: 'Salaries <script>' });
  await as('w', W);
  const chain = await chainFor(shape, made.raw, forW);
  const meta = await chatMeta.open({ ...row(forW), metaCt: named, metaEpoch: 1 }, chain);
  assert.deepEqual([meta.name, meta.metaState], ['Payroll', 'ok']);
  // W isn't a manager, so a name W signs doesn't count
  const byW = await chatMeta.seal(made.key, shape.id, 1, { name: 'Renamed', topic: '' });
  assert.equal((await chatMeta.open({ ...row(forW), metaCt: byW, metaEpoch: 1 }, chain)).metaState, 'unverified');
});
