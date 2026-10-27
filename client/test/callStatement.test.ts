import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import callLink, { type LinkExpect, type LinkMessage } from '../src/lib/crypto/callLink.ts';
import sdpFingerprints from '../src/lib/calls/sdpFingerprints.ts';

// A server that carries a call's handshake and tries to get in the middle of it: it swaps the
// session description, or only its fingerprint, signs a statement of its own, replays an old one,
// or sends one meant for someone else. The browser refuses each before using the description.
const fp = (byte: string) => Array.from({ length: 32 }, () => byte).join(':');
const sdp = (print: string, extra = '') => ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', `a=fingerprint:sha-256 ${print}`, 'm=audio 9 UDP/TLS/RTP/SAVPF 111', `a=fingerprint:sha-256 ${print}`, extra].join('\r\n');

const ana = { id: 'ana-id-0001', key: ed25519.utils.randomPrivateKey() };
const ben = { id: 'ben-id-0002', key: ed25519.utils.randomPrivateKey() };
const eve = { key: ed25519.utils.randomPrivateKey() };
const pub = (k: Uint8Array) => ed25519.getPublicKey(k);
const place = { callId: 'call-0000001', workspaceKey: 'ws-key', origin: 'https://nil.example.com' };
const anaSession = 'ana-session-1';
const benSession = 'ben-session-1';

function offer(over: Partial<{ to: string; at: number; peerSession: string; callId: string; key: Uint8Array; print: string }> = {}) {
  const nonce = callLink.nonce();
  const message = callLink.seal(
    sdp(over.print ?? fp('AB')),
    { from: ana.id, to: over.to ?? ben.id, type: 'offer', nonce, peerNonce: null, session: anaSession, peerSession: over.peerSession ?? benSession, at: over.at ?? Date.now() },
    { place: { ...place, callId: over.callId ?? place.callId }, signingPrivate: over.key ?? ana.key },
  );
  return { message, nonce };
}

const asBen = (over: Partial<LinkExpect> = {}): LinkExpect => ({ place, from: ana.id, me: ben.id, mySession: benSession, type: 'offer', now: Date.now(), seen: new Set(), ...over });

test('the fingerprints are read from every section of a description, once each', () => {
  assert.deepEqual(sdpFingerprints(sdp(fp('ab'))), [`sha-256 ${fp('AB')}`]);
  assert.deepEqual(sdpFingerprints('v=0\r\nm=audio 9 x 0'), []);
});

test('an honest offer and its answer check out against the keys teammates confirmed', () => {
  const { message, nonce } = offer();
  const checked = callLink.verify(message, asBen(), [pub(ana.key)]);
  assert.equal(checked.ok, true);
  const answer = callLink.seal(sdp(fp('CD')), { from: ben.id, to: ana.id, type: 'answer', nonce: callLink.nonce(), peerNonce: nonce, session: benSession, peerSession: anaSession, at: Date.now() }, { place, signingPrivate: ben.key });
  const asAna: LinkExpect = { place, from: ben.id, me: ana.id, mySession: anaSession, type: 'answer', myNonce: nonce, now: Date.now(), seen: new Set() };
  assert.equal(callLink.verify(answer, asAna, [pub(ben.key)]).ok, true);
  // the same answer for an offer this tab never made is stale
  assert.deepEqual(callLink.verify(answer, { ...asAna, myNonce: callLink.nonce(), seen: new Set() }, [pub(ben.key)]), { ok: false, reason: 'stale' });
});

test('a swapped description or fingerprint is refused', () => {
  const { message } = offer();
  const reason = (m: LinkMessage) => (callLink.verify(m, asBen(), [pub(ana.key)]) as { reason?: string }).reason;
  // the server's own certificate in place of Ana's
  assert.equal(reason({ ...message, sdp: message.sdp.replaceAll(fp('AB'), fp('EE')) }), 'tampered');
  // a description that keeps the fingerprint but changes anything else
  assert.equal(reason({ ...message, sdp: `${message.sdp}\r\na=candidate:1 1 udp 1 203.0.113.9 3478 typ relay` }), 'tampered');
  // a second fingerprint slipped in next to the real one
  assert.equal(reason({ ...message, sdp: message.sdp.replace('m=audio', `a=fingerprint:sha-256 ${fp('EE')}\r\nm=audio`) }), 'tampered');
  // the whole description and a matching statement, signed by a key that isn't Ana's
  const forged = callLink.seal(sdp(fp('EE')), { from: ana.id, to: ben.id, type: 'offer', nonce: callLink.nonce(), peerNonce: null, session: anaSession, peerSession: benSession, at: Date.now() }, { place, signingPrivate: eve.key });
  assert.equal(reason(forged), 'forged');
  // a statement edited after signing: the server's fingerprint in it, or only a later time
  const edited = JSON.parse(message.link);
  edited.facts[3] = [`sha-256 ${fp('EE')}`];
  assert.notEqual(callLink.verify({ ...message, sdp: message.sdp.replaceAll(fp('AB'), fp('EE')), link: JSON.stringify(edited) }, asBen(), [pub(ana.key)]).ok, true);
  const later = JSON.parse(message.link);
  later.facts[8] += 1;
  assert.equal(reason({ ...message, link: JSON.stringify(later) }), 'forged');
});

test('a statement for another person, tab, call or time, or one seen before, is refused', () => {
  const key = [pub(ana.key)];
  assert.equal((callLink.verify(offer({ to: 'cy-id-00003' }).message, asBen(), key) as { reason: string }).reason, 'wrong-people');
  assert.equal((callLink.verify(offer().message, asBen({ from: 'cy-id-00003' }), key) as { reason: string }).reason, 'wrong-people');
  assert.equal((callLink.verify(offer({ peerSession: 'ben-old-tab-1' }).message, asBen(), key) as { reason: string }).reason, 'stale');
  assert.equal((callLink.verify(offer({ callId: 'another-call' }).message, asBen(), key) as { reason: string }).reason, 'forged');
  assert.equal((callLink.verify(offer({ at: Date.now() - 3_600_000 }).message, asBen(), key) as { reason: string }).reason, 'stale');
  const seen = new Set<string>();
  const { message } = offer();
  assert.equal(callLink.verify(message, asBen({ seen }), key).ok, true);
  assert.equal((callLink.verify(message, asBen({ seen }), key) as { reason: string }).reason, 'replayed');
  // an answer passed off as an offer
  assert.equal((callLink.verify({ ...message, type: 'answer' }, asBen(), key) as { reason: string }).reason, 'unexpected');
});

test('a renegotiation can’t bring in a new certificate, and junk is refused without throwing', () => {
  const pinned = [`sha-256 ${fp('AB')}`];
  assert.equal(callLink.verify(offer().message, asBen({ pinned }), [pub(ana.key)]).ok, true);
  assert.equal((callLink.verify(offer({ print: fp('EF') }).message, asBen({ pinned }), [pub(ana.key)]) as { reason: string }).reason, 'tampered');
  for (const junk of [null, 'x', {}, { type: 'offer', sdp: 'v=0', link: '{}' }, { type: 'offer', sdp: 'x'.repeat(30_000), link: '{}' }, { type: 'offer', sdp: 'v=0', link: '{"by":"a","text":"b","sig":"c","v":2,"facts":[1,2,3]}' }]) {
    assert.equal(callLink.verify(junk, asBen(), [pub(ana.key)]).ok, false);
  }
  // nothing to sign without a certificate
  assert.throws(() => callLink.seal('v=0', { from: ana.id, to: ben.id, type: 'offer', nonce: callLink.nonce(), peerNonce: null, session: anaSession, peerSession: benSession, at: Date.now() }, { place, signingPrivate: ana.key }));
});
