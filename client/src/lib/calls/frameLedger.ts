import frameManifest from './frameManifest';

// how long a frame may wait for a list naming it, how many frames nobody named (or that came a
// second time) make a sender's frames untrustworthy, and over how long those are counted. A track
// that stops leaves its last fifth of a second unlisted, well under the limit.
const GRACE_MS = 2500;
const LIMIT = 16;
const SPAN_MS = 10_000;
const KEEP_MS = 30_000;
const EARLY_LISTS = 32;

interface Track {
  counter: number;
  pending: Map<string, number>;
  listed: Map<string, number>;
  seen: Map<string, number>;
}

interface Sender {
  key: Uint8Array | null;
  keyAt: number;
  tracks: Map<string, Track>;
  early: { track: string; list: Uint8Array }[];
  misses: number[];
  forged: boolean;
}

// What a receiving browser knows of each sender's frames on the SFU: which arrived, which their
// signed lists (frameManifest) named, and whether frames came that the sender never sent.
export default function frameLedger() {
  const senders = new Map<string, Sender>();

  const sender = (identity: string) => {
    let s = senders.get(identity);
    if (!s) senders.set(identity, (s = { key: null, keyAt: 0, tracks: new Map(), early: [], misses: [], forged: false }));
    return s;
  };
  const track = (s: Sender, id: string) => {
    let t = s.tracks.get(id);
    if (!t) s.tracks.set(id, (t = { counter: -1, pending: new Map(), listed: new Map(), seen: new Map() }));
    return t;
  };
  const miss = (s: Sender, now: number, count = 1) => {
    for (let i = 0; i < count; i++) s.misses.push(now);
  };

  function take(identity: string, trackId: string, bytes: Uint8Array, now: number) {
    const s = sender(identity);
    if (!s.key) return void (s.early.length < EARLY_LISTS && s.early.push({ track: trackId, list: bytes.slice() }));
    const opened = frameManifest.open(bytes, identity, s.key);
    const t = track(s, trackId);
    // a list from before, sent again, names nothing new
    if (!opened || opened.counter < t.counter) return;
    t.counter = opened.counter;
    for (const h of opened.hashes) {
      t.listed.set(h, now);
      t.pending.delete(h);
    }
  }

  return {
    // the key a sender signs its lists with, from its signed frame key
    key(identity: string, publicKey: Uint8Array, now: number) {
      const s = sender(identity);
      if (s.key && s.key.every((b, i) => b === publicKey[i])) return;
      s.key = publicKey;
      s.keyAt = now;
      const early = s.early;
      s.early = [];
      for (const e of early) take(identity, e.track, e.list, now);
    },

    // a frame as it arrived: whether to pass it on to be decrypted
    frame(identity: string, trackId: string, frame: Uint8Array, list: Uint8Array | null, now: number): boolean {
      const s = sender(identity);
      if (s.forged) return false;
      const t = track(s, trackId);
      const h = frameManifest.hash(frame);
      // the same encrypted frame twice is a replay: each one has its own nonce
      if (t.seen.has(h)) miss(s, now);
      t.seen.set(h, now);
      if (!t.listed.has(h)) t.pending.set(h, now);
      if (list) take(identity, trackId, list, now);
      return true;
    },

    // a frame that came without Nil's footer: nobody in the call sent it like that
    unwrapped(identity: string, now: number) {
      const s = sender(identity);
      miss(s, now);
      return !s.forged;
    },

    // the senders whose frames have just turned out not to be theirs
    check(now: number): string[] {
      const caught: string[] = [];
      for (const [identity, s] of senders) {
        for (const t of s.tracks.values()) {
          for (const [h, at] of t.pending) {
            if (now - Math.max(at, s.keyAt) < GRACE_MS || !s.key) continue;
            t.pending.delete(h);
            miss(s, now);
          }
          for (const map of [t.listed, t.seen]) for (const [h, at] of map) if (now - at > KEEP_MS) map.delete(h);
        }
        s.misses = s.misses.filter((at) => now - at <= SPAN_MS);
        if (!s.forged && s.misses.length >= LIMIT) {
          s.forged = true;
          caught.push(identity);
        }
      }
      return caught;
    },

    forget(identity: string) {
      senders.delete(identity);
    },
  };
}
