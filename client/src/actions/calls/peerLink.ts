import callLink, { type LinkMessage, type LinkPlace, type LinkType } from '../../lib/crypto/callLink';
import bitrateFor from '../../lib/calls/bitrateFor';
import keyring from '../../state/keyring';
import keyDirectory from '../keyDirectory';
import linkStats, { type StatsTotals } from './linkStats';
import type CallPeer from '../../types/CallPeer';

export interface LinkTracks {
  audio: MediaStreamTrack | null;
  camera: MediaStreamTrack | null;
  screen: MediaStreamTrack | null;
}

export interface LinkOptions {
  place: LinkPlace;
  me: string;
  mySession: string;
  peer: string;
  peerSession: string;
  // one side of each pair offers, the other answers, so the two never offer at once
  offerer: boolean;
  config: () => RTCConfiguration;
  tracks: () => LinkTracks;
  state: () => { mic: boolean; cam: boolean; screen: boolean };
  others: () => number;
  send: (message: object) => void;
  update: (patch: Partial<CallPeer>) => void;
  refused: (reason: string) => void;
}

const GATHER_MS = 4000;
const ANSWER_MS = 12_000;
const DISCONNECT_GRACE_MS = 2500;
const LOST_MS = 40_000;
const STATS_MS = 2000;
const SOFT = new Set(['stale', 'replayed', 'unexpected']);

// The connection to one other person in a call: their browser and this one, directly or
// through the relay, with the media encrypted between the two (DTLS-SRTP). Every session
// description that goes out is signed, and every one that comes in is checked against the key
// this browser holds for its sender before it's used (see callLink). A network that drops is
// recovered with an ICE restart, by the offering side, as often as it takes.
export default function peerLink(o: LinkOptions) {
  const pc = new RTCPeerConnection(o.config());
  const seen = new Set<string>();
  let pinned: string[] | null = null;
  let myNonce: string | null = null;
  let closed = false;
  let connectedOnce = false;
  let troubleSince = 0;
  let recoverTimer: number | undefined;
  let answerTimer: number | undefined;
  let statsTimer: number | undefined;
  let totals: StatsTotals = { lost: 0, received: 0 };
  let media = new MediaStream();
  let screenMedia = new MediaStream();
  let queue = Promise.resolve();
  const run = (fn: () => Promise<void>) => {
    queue = queue.then(fn).catch(() => {
      if (!closed) recover();
    });
  };

  // Both browsers keep three slots in the same order (sound, camera, screen), so turning the
  // camera or a screen on or off swaps a track and never needs a new handshake.
  if (o.offerer) for (const kind of ['audio', 'video', 'video'] as const) pc.addTransceiver(kind, { direction: 'sendrecv' });
  const channel = pc.createDataChannel('nil', { negotiated: true, id: 0 });

  pc.ontrack = (e) => {
    if (pc.getTransceivers().indexOf(e.transceiver) === 2) screenMedia = new MediaStream([...screenMedia.getTracks(), e.track]);
    else media = new MediaStream([...media.getTracks(), e.track]);
    o.update({ media, screenMedia });
  };

  function attach() {
    const { audio, camera, screen } = o.tracks();
    pc.getTransceivers()
      .slice(0, 3)
      .forEach((t, i) => {
        t.direction = 'sendrecv';
        void t.sender.replaceTrack([audio, camera, screen][i]).catch(() => {});
      });
  }

  // less video per copy as the call grows, since everyone uploads a copy to everyone
  function tune() {
    pc.getTransceivers().forEach((t, i) => {
      if (i === 0 || i > 2) return;
      const params = t.sender.getParameters();
      if (!params.encodings?.length) return;
      params.encodings[0].maxBitrate = bitrateFor(o.others(), i === 2 ? 'screen' : 'camera');
      void t.sender.setParameters(params).catch(() => {});
    });
  }

  // Sets a description and waits for this round of candidates to be gathered, so they go out
  // inside the signed description. The gathering state may still say "complete" from the round
  // before for a moment, so it listens for this round's end-of-candidates instead.
  async function describe(description: RTCSessionDescriptionInit) {
    const done = new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        pc.removeEventListener('icecandidate', onCandidate);
        resolve();
      };
      const onCandidate = (e: RTCPeerConnectionIceEvent) => !e.candidate && finish();
      const timer = window.setTimeout(finish, GATHER_MS);
      pc.addEventListener('icecandidate', onCandidate);
    });
    await pc.setLocalDescription(description);
    await done;
  }

  function seal(type: LinkType, peerNonce: string | null) {
    const id = keyring.identity();
    if (!id) throw new Error('Your keys are locked.');
    const nonce = callLink.nonce();
    const message = callLink.seal(pc.localDescription!.sdp, { from: o.me, to: o.peer, type, nonce, peerNonce, session: o.mySession, peerSession: o.peerSession, at: Date.now() }, { place: o.place, signingPrivate: id.signingPrivate });
    return { message, nonce };
  }

  async function offer(restart: boolean) {
    if (closed) return;
    if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
    if (pc.signalingState !== 'stable') return;
    // until this offer goes out, no answer counts: a late one to the offer before would carry
    // that offer's ICE details and leave this one unable to connect
    myNonce = null;
    await describe(await pc.createOffer({ iceRestart: restart }));
    const { message, nonce } = seal('offer', null);
    myNonce = nonce;
    o.send(message);
    clearTimeout(answerTimer);
    answerTimer = window.setTimeout(() => run(() => offer(connectedOnce)), ANSWER_MS);
  }

  function refuse(reason: string) {
    if (closed) return;
    o.send({ type: 'refused' });
    close();
    o.refused(reason);
  }

  async function verified(message: LinkMessage, type: LinkType) {
    const keys = (await keyDirectory.signers(o.peer, null)).map((s) => s.key);
    const result = callLink.verify(message, { place: o.place, from: o.peer, me: o.me, mySession: o.mySession, type, myNonce, pinned, now: Date.now(), seen }, keys);
    // a description that's merely late, or one seen before, is dropped; anything that doesn't
    // check out as theirs ends the connection
    if (!result.ok) {
      if (!SOFT.has(result.reason)) refuse(keys.length ? result.reason : 'no-key');
      return null;
    }
    pinned = result.facts.fingerprints;
    return result.facts;
  }

  async function onOffer(message: LinkMessage) {
    const facts = await verified(message, 'offer');
    if (!facts || closed) return;
    if (pc.signalingState !== 'stable') await pc.setLocalDescription({ type: 'rollback' });
    await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp });
    attach();
    await describe(await pc.createAnswer());
    o.send(seal('answer', facts.nonce).message);
  }

  async function onAnswer(message: LinkMessage) {
    if (pc.signalingState !== 'have-local-offer' || !myNonce) return;
    if (!(await verified(message, 'answer')) || closed) return;
    clearTimeout(answerTimer);
    await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
  }

  // Asks for a fresh path through the network, again and again with longer pauses, until the
  // connection is back or the call ends.
  function recover() {
    if (closed || recoverTimer !== undefined) return;
    troubleSince ||= Date.now();
    const attempt = () => {
      recoverTimer = undefined;
      if (closed || !troubleSince) return;
      if (Date.now() - troubleSince > LOST_MS) o.update({ link: 'lost' });
      // an offer already on its way gets its answer, or is offered again when ANSWER_MS runs out
      if (o.offerer && pc.signalingState !== 'have-local-offer') run(() => offer(true));
      else if (!o.offerer) o.send({ type: 'restart' });
      recoverTimer = window.setTimeout(attempt, Math.min(15_000, 3000 + (Date.now() - troubleSince) / 4));
    };
    attempt();
  }

  async function poll() {
    if (closed) return;
    const stats = await linkStats(pc, totals).catch(() => null);
    if (!stats || closed) return;
    totals = stats.totals;
    // the browser already refuses a certificate that doesn't match; this checks it said so
    if (stats.certificate && pinned && !pinned.includes(stats.certificate)) return refuse('tampered');
    o.update({ quality: stats.quality });
  }

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    if (state === 'connected' || state === 'completed') {
      connectedOnce = true;
      troubleSince = 0;
      clearTimeout(recoverTimer);
      recoverTimer = undefined;
      o.update({ link: 'connected' });
      tune();
      clearInterval(statsTimer);
      statsTimer = window.setInterval(() => void poll(), STATS_MS);
    } else if (state === 'disconnected') {
      o.update({ link: 'reconnecting' });
      troubleSince ||= Date.now();
      window.setTimeout(() => pc.iceConnectionState === 'disconnected' && recover(), DISCONNECT_GRACE_MS);
    } else if (state === 'failed') {
      o.update({ link: connectedOnce ? 'reconnecting' : 'connecting' });
      recover();
    }
  };

  function sendState() {
    if (channel.readyState === 'open') channel.send(JSON.stringify({ t: 'state', ...o.state() }));
  }
  channel.onopen = sendState;
  channel.onmessage = (e) => {
    if (typeof e.data !== 'string' || e.data.length > 200) return;
    try {
      const m = JSON.parse(e.data);
      if (m?.t === 'state') o.update({ mic: m.mic === true, cam: m.cam === true, screen: m.screen === true });
    } catch {}
  };

  function close() {
    closed = true;
    clearTimeout(recoverTimer);
    clearTimeout(answerTimer);
    clearInterval(statsTimer);
    channel.close();
    pc.close();
  }

  return {
    peerSession: o.peerSession,
    closed: () => closed,
    start() {
      if (!o.offerer) return;
      attach();
      run(() => offer(false));
    },
    handle(message: { type?: unknown }) {
      if (closed) return;
      if (message.type === 'offer' && !o.offerer) run(() => onOffer(message as LinkMessage));
      else if (message.type === 'answer' && o.offerer) run(() => onAnswer(message as LinkMessage));
      else if (message.type === 'restart' && o.offerer && pc.signalingState !== 'have-local-offer') run(() => offer(connectedOnce));
      else if (message.type === 'refused') {
        close();
        o.update({ link: 'refused', refusal: 'theirs' });
      }
    },
    // the answering side asks for a first offer it may have missed
    nudge: () => !o.offerer && !closed && pc.signalingState === 'stable' && !pc.remoteDescription && o.send({ type: 'restart' }),
    // new relay passwords: used for the next path, which a restart asks for now
    refresh() {
      if (closed) return;
      pc.setConfiguration(o.config());
      if (o.offerer) run(() => offer(true));
      else o.send({ type: 'restart' });
    },
    replace(slot: 0 | 1 | 2, track: MediaStreamTrack | null) {
      void pc.getTransceivers()[slot]?.sender.replaceTrack(track).catch(() => {});
      tune();
    },
    tune,
    sendState,
    close,
  };
}
