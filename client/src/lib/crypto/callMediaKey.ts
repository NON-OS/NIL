import signedFacts from './signedFacts';
import sealedBox from './sealedBox';
import factChecks from './factChecks';
import keyHash from './keyHash';
import type { LinkPlace } from './callLink';

// The keys that keep a call on the SFU end to end. The SFU forwards every frame, so the frames
// themselves are encrypted in the browser (AES-GCM, through insertable streams) under a key only
// the people in the call hold. Each sender makes its own key and a new one whenever anyone joins
// or leaves, seals it to each person's X25519 key, and signs it with its Ed25519 key, naming the
// call, who it's for, the name the sender goes by on the SFU, an epoch that only goes up and a
// hash of the key, and the Ed25519 key the sender's frame lists are signed with for this call
// (frameManifest). A browser takes a key only from a sender it holds a key for, only for itself,
// and only newer than the last one from that sender. So the server and the SFU never hold a key,
// can't hand anyone one of their own, and can't pass one person's frames off as another's.

export interface MediaKeyFacts {
  from: string;
  to: string;
  // the name the sender's frames carry on the SFU
  identity: string;
  // the public key this sender signs its lists of frames with, as base64url
  frames: string;
  epoch: number;
  hash: string;
  at: number;
}

export interface MediaKeyMessage {
  type: 'media-key';
  key: string;
  link: string;
}

const KIND = 'nil/call-media-key/v1';
const box = sealedBox(KIND);
const SKEW_MS = 10 * 60_000;
const IDENTITY = /^[A-Za-z0-9_-]{8,43}$/;

const place = (p: LinkPlace) => [p.callId, p.workspaceKey, p.origin];
const list = (f: MediaKeyFacts) => [f.from, f.to, f.identity, f.frames, f.epoch, f.hash, f.at];

function parse(raw: unknown[]): MediaKeyFacts {
  const [from, to, identity, frames, epoch, hash, at] = raw;
  if (raw.length !== 7 || !factChecks.person(from) || !factChecks.person(to) || typeof identity !== 'string' || !IDENTITY.test(identity) || !factChecks.hash(frames) || !factChecks.count(epoch, 2 ** 31) || !factChecks.hash(hash) || !factChecks.time(at)) throw new Error('malformed');
  return { from, to, identity, frames, epoch, hash, at };
}

const callMediaKey = {
  newKey: () => crypto.getRandomValues(new Uint8Array(32)),

  async seal(key: Uint8Array, facts: Omit<MediaKeyFacts, 'hash'>, { place: where, recipientPublic, signingPrivate }: { place: LinkPlace; recipientPublic: Uint8Array; signingPrivate: Uint8Array }): Promise<MediaKeyMessage> {
    const sealed = await box.seal(key, recipientPublic);
    const full = { ...facts, hash: keyHash(key) };
    return { type: 'media-key', key: sealed, link: signedFacts.seal(sealed, { kind: KIND, place: place(where), facts: list(full), by: facts.from, signingPrivate }) };
  },

  // Opens a key a sender sent this browser, or says why not. `keys` are the signing keys this
  // browser holds for the sender; `last` is the newest epoch already taken from them.
  async open(message: unknown, expect: { place: LinkPlace; from: string; me: string; last: number; now: number }, keys: Uint8Array[], mine: { privateKey: Uint8Array; publicKey: Uint8Array }): Promise<{ ok: true; key: Uint8Array; facts: MediaKeyFacts } | { ok: false; reason: string }> {
    const m = message as Partial<MediaKeyMessage> | null;
    if (!m || m.type !== 'media-key' || typeof m.key !== 'string' || typeof m.link !== 'string' || m.key.length > 200 || m.link.length > 2000) return { ok: false, reason: 'malformed' };
    let facts: MediaKeyFacts;
    let signed;
    try {
      const opened = signedFacts.open(m.link);
      if (!opened.facts) return { ok: false, reason: 'unsigned' };
      signed = opened.signed;
      facts = parse(opened.facts);
    } catch {
      return { ok: false, reason: 'malformed' };
    }
    if (signed.by !== expect.from || facts.from !== expect.from || facts.to !== expect.me) return { ok: false, reason: 'wrong-people' };
    if (facts.epoch <= expect.last || Math.abs(expect.now - facts.at) > SKEW_MS) return { ok: false, reason: 'stale' };
    if (signed.text !== m.key) return { ok: false, reason: 'tampered' };
    if (!keys.some((k) => signedFacts.verify(signed, { kind: KIND, place: place(expect.place), facts: list(facts) }, k))) return { ok: false, reason: 'forged' };
    let key: Uint8Array;
    try {
      key = await box.open(m.key, mine.privateKey, mine.publicKey);
    } catch {
      return { ok: false, reason: 'tampered' };
    }
    if (key.length !== 32 || keyHash(key) !== facts.hash) return { ok: false, reason: 'tampered' };
    return { ok: true, key, facts };
  },
};

export default callMediaKey;
