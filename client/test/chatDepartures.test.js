import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, entry, person, signIn, route, reset, confirm, b64u } from './helpers/fakeBrowser.js';

// Leaving someone out of a conversation's next key without a manager: only on the strength of a
// signed departure that checks out in the browser. A server, or a member, can't drop anyone else.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const startEpoch = await load('actions/chat/startEpoch');
const checkRoster = await load('actions/chat/checkRoster');
const chatKeys = await load('actions/chat/chatKeys');
const chatKeyring = await load('state/chatKeyring');
const chatKeySeal = await load('lib/crypto/chatKeySeal');
const signedFacts = await load('lib/crypto/signedFacts');
const chatDeparture = await load('lib/crypto/chatDeparture');

const id = () => b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
let P, users;

beforeEach(async () => {
  reset();
  P = { v: person(), w: person(), x: person(), a: person() };
  users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }, { id: 'x', name: 'Xan' }, { id: 'a', name: 'Ada', role: 'admin' }];
  route('GET', '/api/encryption-keys', () => Object.keys(P).map((k) => entry(k, P[k])));
  signIn('v', P.v, users);
  await confirm(['w', 'x', 'a']);
});

const as = async (who) => {
  chatKeyring.wipe();
  signIn(who, P[who], users);
  await confirm(Object.keys(P).filter((k) => k !== who));
};
const ctx = (shape, epoch, proofs = []) => ({ workspaceKey: store.get().workspaceKey, channelId: shape.id, epoch, wrappedKeys: [], proofs });

// A departure as the browser signs one, with the time it says.
function departure(kind, who, channelId, userId, at = Date.now()) {
  const facts = chatDeparture.list(at);
  return signedFacts.seal(chatDeparture.text(kind, userId), { kind: chatDeparture.kinds[kind], place: chatDeparture.place(kind, store.get().workspaceKey, channelId, userId), facts, by: who, signingPrivate: P[who].signingPrivate });
}

// V makes a channel for V, W and X and manages it; W, who doesn't, starts the next key without X.
async function setup() {
  const shape = { id: id(), kind: 'channel', audience: 'people' };
  const first = await checkRoster((await startEpoch(shape, 1, null, { members: ['v', 'w', 'x'], managers: ['v'] })).raw, ctx(shape, 1), []);
  await as('w');
  const next = await startEpoch(shape, 2, first, { members: ['v', 'w'], managers: ['v'] });
  return { shape, first, next };
}

test('without a signed departure, nobody but a manager can leave someone out', async () => {
  const { shape, first, next } = await setup();
  await assert.rejects(checkRoster(next.raw, ctx(shape, 2), [first]), /wasn’t allowed/);
});

test('the leaver’s own signed leaving lets any member start the key without them', async () => {
  const { shape, first, next } = await setup();
  await as('x');
  const left = departure('leave', 'x', shape.id, 'x');
  await as('v');
  const checked = await checkRoster(next.raw, ctx(shape, 2, [left]), [first]);
  assert.deepEqual([checked.members, checked.departed], [['v', 'w'], ['x']]);
});

test('a leaving signed by someone else, for another conversation, or before they joined, doesn’t count', async () => {
  const { shape, first, next } = await setup();
  const forged = departure('leave', 'w', shape.id, 'x');
  await as('x');
  const elsewhere = departure('leave', 'x', id(), 'x');
  const stale = departure('leave', 'x', shape.id, 'x', first.at - 60_000);
  await as('v');
  for (const proof of [forged, elsewhere, stale]) await assert.rejects(checkRoster(next.raw, ctx(shape, 2, [proof]), [first]), /wasn’t allowed/);
});

test('a removal from the team counts when an admin or a manager signed it, not a member', async () => {
  const { shape, first, next } = await setup();
  await as('a');
  const byAdmin = departure('removal', 'a', '', 'x');
  await as('w');
  const byMember = departure('removal', 'w', '', 'x');
  await as('v');
  assert.deepEqual((await checkRoster(next.raw, ctx(shape, 2, [byAdmin]), [first])).departed, ['x']);
  await assert.rejects(checkRoster(next.raw, ctx(shape, 2, [byMember]), [first]), /wasn’t allowed/);
});

test('one bad copy of a key doesn’t keep out a good one from someone else', async () => {
  const shape = { id: id(), kind: 'group', audience: 'people' };
  const made = await startEpoch(shape, 1, null, { members: ['v', 'w', 'x'], managers: ['v', 'w', 'x'] });
  const good = made.grants.find((g) => g.userId === 'w').wrappedKey;
  const bad = await chatKeySeal.seal(crypto.getRandomValues(new Uint8Array(32)), P.w.publicKey);
  await as('w');
  const roster = await checkRoster(made.raw, { ...ctx(shape, 1), wrappedKeys: [bad, good] }, []);
  const channel = { ...shape, epoch: 1, wrappedKeys: [], metaKeys: [], metaEpoch: null };
  const key = await chatKeys.get(channel, { rosters: [roster], broken: null, forked: false, keysRev: 0 }, 1);
  assert.deepEqual([...key], [...made.key]);
  chatKeyring.wipe();
  await assert.rejects(chatKeys.get(channel, { rosters: [{ ...roster, wrappedKeys: [bad] }], broken: null, forked: false, keysRev: 0 }, 1), /isn’t the one/);
});

test('an admin the server names, with a key nobody here confirmed, can’t remove anyone', async () => {
  P.z = person();
  users.push({ id: 'z', name: 'Zed', role: 'admin' });
  const { shape, first, next } = await setup();
  await as('z');
  const byStranger = departure('removal', 'z', '', 'x');
  // V sees Z listed as an admin, but never confirmed Z's key
  chatKeyring.wipe();
  signIn('v', P.v, users);
  await assert.rejects(checkRoster(next.raw, ctx(shape, 2, [byStranger]), [first]), /wasn’t allowed/);
});
