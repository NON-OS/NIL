import keyring from '../../state/keyring';
import b64u from '../../lib/crypto/b64u';
import callMediaKey, { type MediaKeyMessage } from '../../lib/crypto/callMediaKey';
import frameRatchet from '../../lib/calls/frameRatchet';
import keyDirectory from '../keyDirectory';
import callRuntime from './callRuntime';
import callSignals from './callSignals';
import type { LinkPlace } from '../../lib/crypto/callLink';

// LiveKit keeps up to this many keys for each sender, by index; ours go round them by epoch
const RING = 16;
// how long a sender waits after handing out a new key before encrypting with it, so frames don't
// arrive at someone who doesn't hold it yet
const SWITCH_MS = 1200;

const rt = callRuntime;

export interface KeySink {
  // hands LiveKit a key for one sender's name on the SFU
  put(identity: string, raw: Uint8Array, index: number): Promise<void>;
  // and the key that sender's lists of frames are signed with
  lists(identity: string, publicKey: Uint8Array): void;
}

let sink: KeySink | null = null;
let place: LinkPlace | null = null;
let myIdentity = '';
let myLists = '';
let epoch = 0;
// the key frames go out under now, and the one about to replace it, each with its counter
let current: { key: Uint8Array; at: number } | null = null;
let next: { key: Uint8Array; at: number } | null = null;
let switchTimer: number | undefined;
const lastFrom = new Map<string, number>();
const userOf = new Map<string, string>();

async function sendTo(userId: string, key: Uint8Array, at: number) {
  const id = keyring.identity();
  const entry = (await keyDirectory.load()).get(userId);
  // only to someone whose key this person can see and hasn't held back from
  if (!id || !place || !entry || entry.state === 'changed' || rt.active()?.peers[userId]?.held !== false) return;
  const message = await callMediaKey.seal(key, { from: rt.me(), to: userId, identity: myIdentity, frames: myLists, epoch: at, at: Date.now() }, { place, recipientPublic: b64u.decode(entry.publicKey), signingPrivate: id.signingPrivate });
  callSignals.send(place.callId, userId, message);
}

// moves this browser's frames onto the key waiting to take over
function use() {
  if (!next || !sink) return;
  current?.key.fill(0);
  current = next;
  next = null;
  void sink.put(myIdentity, current.key, current.at % RING);
}

// This browser's frame keys on the SFU, and everyone else's. Each person makes their own key,
// a new one whenever someone joins or leaves, and seals it to the others (see callMediaKey).
const sfuKeys = {
  start(where: LinkPlace, identity: string, keys: KeySink, listKey: Uint8Array) {
    sfuKeys.stop();
    place = where;
    myIdentity = identity;
    myLists = b64u.encode(listKey);
    sink = keys;
  },

  // A new key for this browser's frames, sent to everyone in the call it may talk to. The first
  // one is used straight away; later ones once the others have had time to take them.
  async rotate(others: string[]) {
    if (!sink) return;
    // seconds since 1970 at least, so a key from a new tab is always newer than one from an old one
    epoch = Math.max(epoch + 1, Math.floor(Date.now() / 1000));
    const key = callMediaKey.newKey();
    const at = epoch;
    next = { key, at };
    await Promise.all(others.map((userId) => sendTo(userId, key, at).catch(() => {})));
    if (next?.at !== at) return;
    clearTimeout(switchTimer);
    if (current) switchTimer = window.setTimeout(use, SWITCH_MS);
    else use();
  },

  // Someone joined. Rather than a new key sealed to everyone, this browser's key steps forward
  // and only the newcomers get it: the others' browsers step it forward themselves when frames
  // stop decrypting, and the newcomers can't step back to anything sent before they came.
  async ratchet(newcomers: string[]) {
    const base = next ?? current;
    if (!sink || !base) return;
    const stepped = { key: frameRatchet(base.key), at: base.at };
    await Promise.all(newcomers.map((userId) => sendTo(userId, stepped.key, stepped.at).catch(() => {})));
    if (next === base) {
      // a switch is waiting: it takes the stepped key
      next = stepped;
    } else if (current === base && !next) {
      next = stepped;
      clearTimeout(switchTimer);
      switchTimer = window.setTimeout(use, SWITCH_MS);
    }
  },


  // someone this person just let hear them gets the key in use now and, in the moment before
  // a new one takes over, that one too, oldest first so it isn't taken for a replay
  async share(userId: string) {
    const keys = [current, next].filter((k): k is { key: Uint8Array; at: number } => k !== null);
    for (const k of keys) await sendTo(userId, k.key, k.at).catch(() => {});
  },

  // a key someone sent this browser; anything that doesn't check out is dropped
  async take(from: string, message: MediaKeyMessage) {
    const id = keyring.identity();
    if (!sink || !place || !id) return false;
    const signers = (await keyDirectory.signers(from, null)).map((s) => s.key);
    const opened = await callMediaKey.open(message, { place, from, me: rt.me(), last: lastFrom.get(from) ?? 0, now: Date.now() }, signers, id);
    // the name the key is for must be the one the server gave the sender's tab, so nobody in the
    // call can take over someone else's frames with a key of their own
    const member = rt.active()?.view.members.find((m) => m.userId === from);
    if (!opened.ok || !member?.sfu || member.sfu !== opened.facts.identity) return false;
    lastFrom.set(from, opened.facts.epoch);
    for (const [identity, user] of userOf) if (user === from && identity !== opened.facts.identity) userOf.delete(identity);
    userOf.set(opened.facts.identity, from);
    sink.lists(opened.facts.identity, b64u.decode(opened.facts.frames));
    await sink.put(opened.facts.identity, opened.key, opened.facts.epoch % RING);
    opened.key.fill(0);
    return true;
  },

  // whether this person has given this browser a key yet: until then, it can't see or hear them
  has: (userId: string) => lastFrom.has(userId),

  // who a name on the SFU belongs to, as that person signed it
  userOf: (identity: string) => userOf.get(identity) ?? null,

  stop() {
    clearTimeout(switchTimer);
    current?.key.fill(0);
    current = null;
    next = null;
    sink = null;
    place = null;
    epoch = 0;
    lastFrom.clear();
    userOf.clear();
  },
};

export default sfuKeys;
