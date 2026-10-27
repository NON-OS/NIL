import keyring from '../../state/keyring';
import socket from '../../realtime/socket';
import b64u from '../../lib/crypto/b64u';
import callMediaKey, { type MediaKeyMessage } from '../../lib/crypto/callMediaKey';
import keyDirectory from '../keyDirectory';
import callRuntime from './callRuntime';
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
}

let sink: KeySink | null = null;
let place: LinkPlace | null = null;
let myIdentity = '';
let epoch = 0;
let current: Uint8Array | null = null;
let switchTimer: number | undefined;
const lastFrom = new Map<string, number>();
const userOf = new Map<string, string>();

async function sendTo(userId: string, key: Uint8Array, at: number) {
  const id = keyring.identity();
  const entry = (await keyDirectory.load()).get(userId);
  // only to someone whose key this person can see and hasn't held back from
  if (!id || !place || !entry || entry.state === 'changed' || rt.active()?.peers[userId]?.held !== false) return;
  const message = await callMediaKey.seal(key, { from: rt.me(), to: userId, identity: myIdentity, epoch: at, at: Date.now() }, { place, recipientPublic: b64u.decode(entry.publicKey), signingPrivate: id.signingPrivate });
  socket.call({ type: 'call.signal', callId: place.callId, to: userId, blob: JSON.stringify(message) });
}

// This browser's frame keys on the SFU, and everyone else's. Each person makes their own key,
// a new one whenever someone joins or leaves, and seals it to the others (see callMediaKey).
const sfuKeys = {
  start(where: LinkPlace, identity: string, keys: KeySink) {
    sfuKeys.stop();
    place = where;
    myIdentity = identity;
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
    await Promise.all(others.map((userId) => sendTo(userId, key, at).catch(() => {})));
    const use = () => {
      if (at !== epoch || !sink) return;
      current?.fill(0);
      current = key;
      void sink.put(myIdentity, key, at % RING);
    };
    clearTimeout(switchTimer);
    if (current) switchTimer = window.setTimeout(use, SWITCH_MS);
    else use();
  },

  // someone this person just let hear them gets the key in use now
  share(userId: string) {
    if (current) void sendTo(userId, current, epoch);
  },

  // a key someone sent this browser; anything that doesn't check out is dropped
  async take(from: string, message: MediaKeyMessage) {
    const id = keyring.identity();
    if (!sink || !place || !id) return false;
    const signers = (await keyDirectory.signers(from, null)).map((s) => s.key);
    const opened = await callMediaKey.open(message, { place, from, me: rt.me(), last: lastFrom.get(from) ?? 0, now: Date.now() }, signers, id);
    if (!opened.ok) return false;
    lastFrom.set(from, opened.facts.epoch);
    for (const [identity, user] of userOf) if (user === from && identity !== opened.facts.identity) userOf.delete(identity);
    userOf.set(opened.facts.identity, from);
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
    current?.fill(0);
    current = null;
    sink = null;
    place = null;
    epoch = 0;
    lastFrom.clear();
    userOf.clear();
  },
};

export default sfuKeys;
