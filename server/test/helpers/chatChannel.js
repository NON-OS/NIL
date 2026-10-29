import crypto from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@noble/hashes/utils';
import signers from './signers.js';

const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const chatId = () => blob(16);
const WORKSPACE = Symbol('workspace');
const hashOf = (raw) => crypto.createHash('sha256').update('nil/chat-roster-hash/v1').update(raw).digest('base64url');

// Signs facts the way a browser does (see signedFacts in the web app), with the key `by`
// published. Someone with no key published gets a random signature, which nothing accepts.
function sign(by, { kind, place, facts, text = '' }) {
  const signer = signers.get(by);
  const at = signer ? place.map((p) => (p === WORKSPACE ? signer.workspaceKey : p)) : place;
  const message = `nil/signed/v1\n${kind}\n${JSON.stringify([...at, ...facts])}\n${by}\n${text}`;
  const sig = signer ? Buffer.from(ed25519.sign(utf8ToBytes(message), signer.signingPrivate)).toString('base64url') : blob(64);
  return JSON.stringify({ by, text, sig, v: 2, facts });
}

// A member list signed the way a browser signs one, and a sealed key for each person on it.
// `prev` is the signed list it follows, as the server has it; it's dated after that one unless
// `at` says otherwise.
function roster({ by, channelId, epoch = 1, prev = null, kind = 'channel', audience = 'people', members, managers = [by], at, signedBy = by }) {
  const sorted = [...new Set(members)].sort();
  const lead = [...new Set(managers)].sort().filter((m) => sorted.includes(m));
  const priorAt = prev ? JSON.parse(prev).facts[6] : 0;
  const facts = [kind, audience, sorted, kind === 'channel' ? lead : sorted, blob(32), prev ? hashOf(prev) : null, at ?? Math.max(Date.now(), priorAt + 1)];
  const raw = sign(signedBy, { kind: 'nil/chat-roster/v1', place: [WORKSPACE, channelId, epoch], facts });
  return { roster: by === signedBy ? raw : JSON.stringify({ ...JSON.parse(raw), by }), grants: sorted.map((userId) => ({ userId, wrappedKey: blob(92) })) };
}

// The next epoch of a conversation as `call` sees it: its number and a list following the last.
async function next(call, channelId, options) {
  const epochs = (await call('GET', `/api/chat/channels/${channelId}/epochs`)).data.epochs;
  const last = epochs[epochs.length - 1];
  const kind = JSON.parse(last.roster).facts[0];
  return { epoch: last.epoch + 1, ...roster({ kind, ...options, channelId, epoch: last.epoch + 1, prev: last.roster }) };
}

// Starts a conversation as `call` (a test client) and returns what the server answered.
async function makeChannel(call, me, { kind = 'channel', audience = 'people', members = [me], keyed = members, managers, metaCt = kind === 'channel' ? blob(60) : null, disappearSeconds = null } = {}) {
  const id = chatId();
  const r = roster({ by: me, channelId: id, kind, audience, members: keyed, managers: managers ?? (kind === 'channel' ? [me] : keyed) });
  return call('POST', '/api/chat/channels', { id, kind, audience, members, metaCt, disappearSeconds, ...r });
}

// A signed statement as a browser makes one: a leaving of `channelId`, or a removal of `userId`
// from the team.
function statement(by, { channelId, userId = by, at = Date.now() }) {
  if (channelId) return sign(by, { kind: 'nil/chat-leave/v1', place: [WORKSPACE, channelId, by], facts: [at] });
  return sign(by, { kind: 'nil/chat-removal/v1', place: [WORKSPACE, userId], facts: [at], text: userId });
}

// A message as a browser sends one: ciphertext under the current epoch, with the time now.
const message = (epoch, extra = {}) => ({ id: chatId(), kind: 'message', epoch, sentAt: Date.now(), bodyCt: blob(200), ttl: null, ...extra });

export default { chatId, roster, next, makeChannel, message, statement };
