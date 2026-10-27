import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import signedFacts from './signedFacts';
import factChecks from './factChecks';
import b64u from './b64u';
import sdpFingerprints from '../calls/sdpFingerprints';
import type { Signed } from './signedText';

// The statement that ties a call's media to the people in it. Media runs over DTLS, and the
// certificate each browser makes for a call is announced by its fingerprint in the session
// description the server passes along. A server could swap that description for one of its
// own and sit in the middle, so each browser signs, with the Ed25519 key teammates confirmed in
// the key directory, the call, the workspace, who it is and who it's for, the fingerprints in
// its own description, a hash of the whole description and a fresh nonce. The other browser
// checks all of it against the key it holds for the sender before using the description, and
// the browser itself then refuses any certificate that doesn't match the fingerprint.

export type LinkType = 'offer' | 'answer';

export interface LinkPlace {
  callId: string;
  workspaceKey: string;
  origin: string;
}

export interface LinkFacts {
  from: string;
  to: string;
  type: LinkType;
  fingerprints: string[];
  // fresh for each description; an answer repeats the offer's nonce and the offering tab
  nonce: string;
  peerNonce: string | null;
  session: string;
  peerSession: string;
  at: number;
}

export interface LinkMessage {
  type: LinkType;
  sdp: string;
  link: string;
}

export interface LinkExpect {
  place: LinkPlace;
  from: string;
  me: string;
  mySession: string;
  type: LinkType;
  // for an answer: the nonce of the offer it answers
  myNonce?: string | null;
  // fingerprints already verified for this peer: a renegotiation may not change them
  pinned?: string[] | null;
  now: number;
  seen: Set<string>;
}

const KIND = 'nil/call-link/v1';
// how far apart two browsers' clocks may be
const SKEW_MS = 10 * 60_000;
const MAX_SDP = 20_000;
const NONCE = /^[A-Za-z0-9_-]{22}$/;
const SESSION = /^[A-Za-z0-9_-]{8,43}$/;

const place = (p: LinkPlace) => [p.callId, p.workspaceKey, p.origin];
const list = (f: LinkFacts) => [f.from, f.to, f.type, f.fingerprints, f.nonce, f.peerNonce, f.session, f.peerSession, f.at];
const sdpHash = (sdp: string) => b64u.encode(sha256(concatBytes(utf8ToBytes('nil/call-sdp/v1\n'), utf8ToBytes(sdp))));
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function parseFacts(raw: unknown[]): LinkFacts {
  const [from, to, type, fingerprints, nonce, peerNonce, session, peerSession, at] = raw;
  const prints = Array.isArray(fingerprints) && fingerprints.length > 0 && fingerprints.length <= 4 && fingerprints.every((f) => typeof f === 'string' && f.length <= 200);
  if (
    raw.length !== 9 ||
    !factChecks.person(from) ||
    !factChecks.person(to) ||
    (type !== 'offer' && type !== 'answer') ||
    !prints ||
    typeof nonce !== 'string' ||
    !NONCE.test(nonce) ||
    !(peerNonce === null || (typeof peerNonce === 'string' && NONCE.test(peerNonce))) ||
    typeof session !== 'string' ||
    !SESSION.test(session) ||
    typeof peerSession !== 'string' ||
    !SESSION.test(peerSession) ||
    !factChecks.time(at)
  ) {
    throw new Error('malformed');
  }
  return { from, to, type, fingerprints: fingerprints as string[], nonce, peerNonce, session, peerSession, at };
}

const callLink = {
  maxSdp: MAX_SDP,

  nonce: () => b64u.encode(crypto.getRandomValues(new Uint8Array(16))),

  seal(sdp: string, facts: Omit<LinkFacts, 'fingerprints'>, { place: where, signingPrivate }: { place: LinkPlace; signingPrivate: Uint8Array }): LinkMessage {
    const full: LinkFacts = { ...facts, fingerprints: sdpFingerprints(sdp) };
    if (!full.fingerprints.length) throw new Error('This connection has no certificate fingerprint to sign.');
    const link = signedFacts.seal(sdpHash(sdp), { kind: KIND, place: place(where), facts: list(full), by: facts.from, signingPrivate });
    return { type: facts.type, sdp, link };
  },

  // Checks a description from a peer before it's used. Returns the facts it was signed with, or
  // why it was refused. `keys` are the signing keys this browser holds for the sender.
  verify(message: unknown, expect: LinkExpect, keys: Uint8Array[]): { ok: true; facts: LinkFacts } | { ok: false; reason: string } {
    const m = message as Partial<LinkMessage> | null;
    if (!m || typeof m.sdp !== 'string' || typeof m.link !== 'string' || m.sdp.length > MAX_SDP || m.link.length > 4000) return { ok: false, reason: 'malformed' };
    if (m.type !== expect.type) return { ok: false, reason: 'unexpected' };
    let signed: Signed;
    let facts: LinkFacts;
    try {
      const opened = signedFacts.open(m.link);
      if (!opened.facts) return { ok: false, reason: 'unsigned' };
      signed = opened.signed;
      facts = parseFacts(opened.facts);
    } catch {
      return { ok: false, reason: 'malformed' };
    }
    if (signed.by !== expect.from || facts.from !== expect.from || facts.to !== expect.me || facts.type !== expect.type) return { ok: false, reason: 'wrong-people' };
    if (facts.peerSession !== expect.mySession) return { ok: false, reason: 'stale' };
    if (expect.type === 'answer' && facts.peerNonce !== expect.myNonce) return { ok: false, reason: 'stale' };
    if (Math.abs(expect.now - facts.at) > SKEW_MS) return { ok: false, reason: 'stale' };
    if (expect.seen.has(facts.nonce)) return { ok: false, reason: 'replayed' };
    if (signed.text !== sdpHash(m.sdp)) return { ok: false, reason: 'tampered' };
    if (!sameList(sdpFingerprints(m.sdp), facts.fingerprints)) return { ok: false, reason: 'tampered' };
    if (expect.pinned && !sameList(expect.pinned, facts.fingerprints)) return { ok: false, reason: 'tampered' };
    const signedHere = { kind: KIND, place: place(expect.place), facts: list(facts) };
    if (!keys.some((key) => signedFacts.verify(signed, signedHere, key))) return { ok: false, reason: 'forged' };
    expect.seen.add(facts.nonce);
    return { ok: true, facts };
  },
};

export default callLink;
