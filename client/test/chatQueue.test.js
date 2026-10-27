import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, entry, person, signIn, route, reset, confirm, b64u } from './helpers/fakeBrowser.js';

// What chat keeps on this device: queued messages only as ciphertext, sealed again when their key
// changes, given up on as signed tombstones; and the search index, unreadable without the keys.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const startEpoch = await load('actions/chat/startEpoch');
const chatQueue = await load('actions/chat/chatQueue');
const chatIndex = await load('actions/chat/chatIndex');
const chatRosters = await load('actions/chat/chatRosters');
const openMessage = await load('actions/chat/openMessage');
const chatStreams = await load('actions/chat/chatStreams');
const chatDisk = await load('lib/chatDisk');
const chatKeyring = await load('state/chatKeyring');

const id = () => b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
let V, W, shape, rows;

beforeEach(async () => {
  reset();
  [V, W] = [person(), person()];
  signIn('v', V, [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }]);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W)]);
  await confirm(['w']);
  shape = { id: id(), kind: 'group', audience: 'people' };
  rows = [];
  route('GET', /\/api\/chat\/channels\/[^/]+\/epochs/, () => ({ epochs: rows }));
  chatRosters.clear();
  chatKeyring.wipe();
});

async function epoch(n, prev) {
  const made = await startEpoch(shape, n, prev, { members: ['v', 'w'], managers: ['v', 'w'] });
  rows.push({ epoch: n, roster: made.raw, proofs: [], wrappedKeys: [made.grants.find((g) => g.userId === 'v').wrappedKey] });
  return made;
}
const channel = (n) => ({ ...shape, epoch: n, members: ['v', 'w'], keyHolders: ['v', 'w'], wrappedKeys: [], metaKeys: [], departures: [], forwardDays: null, purgedEpoch: 0, metaCt: null, metaEpoch: null, disappearSeconds: null, createdBy: 'v', rotateAt: null });
const asRow = (q) => ({ id: q.id, channelId: q.channelId, seq: 1, threadId: q.threadId, kind: q.type === 'reaction' ? 'reaction' : 'message', senderId: 'v', epoch: q.epoch, sentAt: q.sentAt, bodyCt: q.bodyCt, edits: 0, deleted: q.type === 'deleted', replies: 0, lastReplyAt: null, createdAt: 1, updatedAt: 1, expiresAt: null });
const everything = async () => JSON.stringify([...(await chatDisk.list('queue', '')), ...(await chatDisk.list('files', '')), ...(await chatDisk.list('search', ''))].map(([k, v]) => [k, v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v]));

test('a queued message is kept only as ciphertext, and opens as its sender wrote it', async () => {
  await epoch(1, null);
  const draft = { id: id(), channelId: shape.id, threadId: null, type: 'message', stream: 'aaaaaaaaaaaaaaaa', n: 7, files: [], sent: [], ping: [], failed: null, at: Date.now() };
  const q = await chatQueue.seal(channel(1), draft, { text: 'the vault code is 4471' });
  await chatQueue.save(q);
  assert.ok(!(await everything()).includes('4471'), 'no plaintext on the device');
  const chain = await chatRosters.load(channel(1));
  const opened = await openMessage(asRow(q), channel(1), chain);
  assert.deepEqual([opened.state, opened.text, opened.n], ['ok', 'the vault code is 4471', 7]);
});

test('a message that waited past a new key is sealed again under it, keeping its number; one given up on becomes a tombstone', async () => {
  const first = await epoch(1, null);
  const draft = { id: id(), channelId: shape.id, threadId: null, type: 'message', stream: 'bbbbbbbbbbbbbbbb', n: 3, files: [], sent: [], ping: [], failed: null, at: Date.now() };
  const q = await chatQueue.seal(channel(1), draft, { text: 'later' });
  await epoch(2, (await chatRosters.load(channel(1))).rosters[0]);
  chatRosters.clear();
  const again = await chatQueue.reseal(channel(2), q);
  assert.equal(again.epoch, 2);
  const chain = await chatRosters.load(channel(2));
  const opened = await openMessage(asRow(again), channel(2), chain);
  assert.deepEqual([opened.state, opened.text, opened.n, opened.stream], ['ok', 'later', 3, 'bbbbbbbbbbbbbbbb']);
  const stone = await chatQueue.reseal(channel(2), again, { tombstone: true });
  const gone = await openMessage({ ...asRow(stone), id: id() }, channel(2), chain);
  assert.equal(gone.state, 'unverified', 'a tombstone can’t be moved to another id');
  const kept = await openMessage(asRow(stone), channel(2), chain);
  assert.deepEqual([kept.type, kept.n, kept.text], ['deleted', 3, '']);
  assert.ok(first.key.length === 32);
});

test('the search index is encrypted on the device, found with the keys and unreadable without them', async () => {
  chatIndex.note([{ id: id(), channelId: shape.id, threadId: null, senderId: 'w', sentAt: Date.now(), seq: 4, state: 'ok', type: 'message', reaction: false, text: 'quarterly numbers look strong', files: [{ name: 'q3-report.pdf' }], expiresAt: null }]);
  const hits = await chatIndex.search('quarterly report');
  assert.equal(hits.length, 1);
  assert.ok(!(await everything()).includes('quarterly'), 'nothing readable on the device');
  // another identity, or none, opens nothing
  signIn('v', person(), [{ id: 'v', name: 'Vic' }]);
  assert.deepEqual(await chatIndex.search('quarterly'), []);
  signIn('v', null, [{ id: 'v', name: 'Vic' }]);
  assert.deepEqual(await chatIndex.search('quarterly'), []);
});

test('a mark ahead of what arrived is a message held back at the end', () => {
  const m = (n, seq) => ({ id: `m${seq}`, seq, n, stream: 'cccccccccccccccc', senderId: 'w', state: 'ok', sentAt: seq, expiresAt: null });
  const marks = { 'w/cccccccccccccccc': { senderId: 'w', scopes: { main: { n: 4, until: null } } } };
  assert.deepEqual(chatStreams([m(1, 1), m(2, 2)], { fromStart: true, marks }), [{ kind: 'missing', senderId: 'w', count: 2 }]);
  assert.deepEqual(chatStreams([m(1, 1), m(2, 2), m(3, 3), m(4, 4)], { fromStart: true, marks }), []);
  // the last one was set to disappear, and has
  const gone = { 'w/cccccccccccccccc': { senderId: 'w', scopes: { main: { n: 4, until: 1 } } } };
  assert.deepEqual(chatStreams([m(1, 1), m(2, 2)], { fromStart: true, marks: gone }), []);
  // someone else posting under W's stream name neither fills W's gap nor blames W
  const other = (n, seq) => ({ ...m(n, seq), id: `x${seq}`, senderId: 'x' });
  assert.deepEqual(chatStreams([m(1, 1), m(2, 2), other(1, 3), other(2, 4)], { fromStart: true, marks }), [{ kind: 'missing', senderId: 'w', count: 2 }]);
});

test('a mark is signed by its tab’s sender and opens only as theirs', async () => {
  const chatMarks = await load('actions/chat/chatMarks');
  const chatState = await load('state/chatState');
  await epoch(1, null);
  chatState.set({ channels: { [shape.id]: channel(1) } });
  let sent;
  route('PUT', /\/marks\//, (url, body) => {
    sent = { stream: url.split('/').pop(), ...body };
    return { ok: true };
  });
  chatMarks.record(shape.id, 'dddddddddddddddd', 'main', 9, null);
  await new Promise((r) => setTimeout(r, 1700));
  assert.ok(sent, 'the mark went out');
  // as V's it opens; filed under W, who didn't sign it, it doesn't
  const row = { userId: 'v', stream: sent.stream, epoch: 1, sentAt: sent.sentAt, bodyCt: sent.bodyCt };
  await chatMarks.open(channel(1), row);
  assert.deepEqual(chatState.get().marks[shape.id][`v/${sent.stream}`], { senderId: 'v', scopes: { main: { n: 9, until: null } }, edits: {} });
  chatState.set({ marks: {} });
  await chatMarks.open(channel(1), { ...row, userId: 'w' });
  assert.equal(chatState.get().marks[shape.id], undefined);
});
