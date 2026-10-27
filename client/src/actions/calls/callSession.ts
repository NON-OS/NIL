import store from '../../state/store';
import callStore from '../../state/callStore';
import toast from '../../state/toast';
import socket from '../../realtime/socket';
import callLink from '../../lib/crypto/callLink';
import vault from '../vault';
import keyDirectory from '../keyDirectory';
import callApi from './callApi';
import iceConfig from './iceConfig';
import peerLink from './peerLink';
import callRuntime from './callRuntime';
import callMedia from './callMedia';
import localMedia from './localMedia';
import audioLevels from './audioLevels';
import callPeers from './callPeers';
import callSfu from './callSfu';
import callLifecycle from './callLifecycle';
import callSignals from './callSignals';
import ringNotice from './ringNotice';
import type CallView from '../../types/CallView';

const rt = callRuntime;
const REFUSALS: Record<string, string> = {
  'no-key': 'hasn’t set up encryption keys yet, so Nil can’t check it’s them',
  theirs: 'couldn’t verify this connection, so their browser refused it',
};
let declined: string | null = null;

const place = (callId: string) => ({ callId, workspaceKey: store.get().workspaceKey, origin: store.get().origin });


function connect(callId: string, userId: string, session: string) {
  const link = peerLink({
    place: place(callId),
    me: rt.me(),
    mySession: rt.session(),
    peer: userId,
    peerSession: session,
    offerer: rt.me() < userId,
    config: iceConfig.current,
    tracks: () => rt.tracks,
    allowed: () => !rt.active()?.peers[userId]?.held,
    state: () => ({ mic: Boolean(rt.active()?.mic), cam: Boolean(rt.active()?.cam), screen: Boolean(rt.active()?.screen) }),
    others: () => rt.links.size,
    send: (message) => callSignals.send(callId, userId, message),
    update(patch) {
      if (patch.media) audioLevels.watch(`peer:${userId}`, patch.media, (speaking) => rt.patchPeer(userId, { speaking }, session));
      // someone starts sharing their screen: show it large
      if (patch.screen && !rt.active()?.peers[userId]?.screen) rt.patch(() => ({ layout: 'speaker', pinned: null }));
      if (patch.link === 'lost') rt.say(`Lost the connection to ${rt.name(userId)}. Still trying.`);
      rt.patchPeer(userId, patch, session);
    },
    refused(reason) {
      rt.patchPeer(userId, { link: 'refused', refusal: reason }, session);
      rt.say(`Nil refused the connection to ${rt.name(userId)}: ${REFUSALS[reason] ?? 'it couldn’t verify their key'}.`);
    },
  });
  rt.links.set(userId, link);
  callPeers.add(userId, session);
  link.start();
  window.setTimeout(() => link.nudge(), 5000);
  rt.links.forEach((l) => l.tune());
}

function drop(userId: string) {
  rt.links.get(userId)?.close();
  rt.links.delete(userId);
  audioLevels.unwatch(`peer:${userId}`);
}

function teardown() {
  callLifecycle.stop();
  callSignals.clear();
  for (const userId of [...rt.links.keys()]) drop(userId);
  void callSfu.close();
  callMedia.stopAll();
  audioLevels.stopAll();
  iceConfig.clear();
  if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
  callStore.set({ active: null });
}

// Brings the call in line with what the server says: connects to whoever came in, lets go
// of whoever left, and starts over with anyone who came back from a new tab.
function reconcile(view: CallView) {
  const a = rt.active();
  if (!a || a.id !== view.id) return;
  const others = view.members.filter((m) => m.userId !== rt.me());
  for (const [userId, link] of [...rt.links]) {
    const member = others.find((m) => m.userId === userId);
    if (member?.session === link.peerSession) continue;
    drop(userId);
    if (!member) {
      callPeers.remove(userId);
      rt.say(`${rt.name(userId)} left the call.`);
    }
  }
  rt.patch(() => ({ view }));
  if (a.phase !== 'live') return;
  if (view.mode === 'sfu') {
    for (const userId of [...rt.links.keys()]) drop(userId);
    callSfu.reconcile(view, others);
  }
  for (const m of view.mode === 'sfu' ? [] : others) {
    if (rt.links.has(m.userId)) continue;
    if (!a.peers[m.userId]) rt.say(`${rt.name(m.userId)} joined the call.`);
    connect(view.id, m.userId, m.session);
  }
  // a call with a person is over once nobody else is in it or being rung
  if (view.kind === 'person' && !others.length && !view.ringing.length) {
    const who = declined ? `${rt.name(declined)} declined.` : null;
    callSession.end(rt.active()?.everConnected ? 'The call ended.' : who ?? 'No answer.');
  }
}

// back into a call this tab dropped out of, if it's still going
async function rejoinCall(callId: string) {
  const view = (await callApi.list().catch(() => [])).find((c) => c.id === callId);
  if (!view) return void toast.show('That call has ended.');
  await callSession.enter(view).catch(toast.error);
}

// Unlocks this person's keys if they aren't yet: every connection is signed with them.
async function ready() {
  if (!vault.unlocked()) await vault.unlock({ passkey: store.get().passkeys.length > 0 });
}

// What one person in the call said to this one, once opened: on the SFU only frame keys, on
// the mesh the handshake for the connection between the two.
function heard(callId: string, from: string, message: { type?: unknown }) {
  if (message.type === 'media-key') return void callSfu.key(from, message);
  if (rt.active()!.view.mode === 'sfu') return;
  // a connection their browser refused comes back when they try again; one this browser
  // refused waits for this person to say so
  const current = rt.links.get(from);
  if (current?.closed() && rt.active()!.peers[from]?.refusal === 'theirs') drop(from);
  if (!rt.links.has(from)) {
    const member = rt.active()!.view.members.find((m) => m.userId === from);
    if (!member || member.userId === rt.me()) return;
    connect(callId, from, member.session);
  }
  rt.links.get(from)!.handle(message);
}

const callSession = {
  async start(target: { with: string[] } | { projectId: string }, { video = false } = {}) {
    await ready();
    if ('with' in target) {
      const keys = await keyDirectory.load({ fresh: true });
      const missing = target.with.filter((id) => !keys.get(id));
      if (missing.length) throw new Error(`${rt.name(missing[0])} hasn’t set up encryption keys yet. They need to open Nil and unlock once before you can call them.`);
    }
    await callSession.enter(await callApi.start(target), { video });
  },

  async enter(view: CallView, { video = false } = {}) {
    if (rt.active()?.id === view.id) return;
    if (rt.active()) callSession.leave();
    await ready();
    declined = null;
    rt.setSession(callLink.nonce());
    ringNotice.stop(view.id);
    callStore.set((s) => ({
      ringing: s.ringing.filter((id) => id !== view.id),
      active: { id: view.id, view, phase: 'joining', mic: true, cam: false, screen: false, micBlocked: false, camBlocked: false, speaking: false, local: null, localScreen: null, peers: {}, layout: 'grid', minimized: false, pinned: null, everConnected: false, interrupted: null, speaker: localMedia.prefs().speaker },
    }));
    try {
      await callMedia.open({ video });
      await iceConfig.load(view.id, () => rt.links.forEach((l) => l.refresh()));
    } catch (err) {
      teardown();
      throw err;
    }
    callLifecycle.start();
    callSession.rejoin();
  },

  rejoin() {
    const a = rt.active();
    if (a) socket.call({ type: 'call.join', callId: a.id, session: rt.session() });
  },

  joined(view: CallView) {
    if (rt.active()?.id !== view.id) return;
    rt.patch(() => ({ phase: 'live' }));
    reconcile(view);
  },

  update: reconcile,

  // a message from someone in the call, sealed to this person (callSignals)
  signal(callId: string, from: string, blob: unknown) {
    if (rt.active()?.id !== callId || typeof blob !== 'string' || blob.length > 64_000) return;
    callSignals.receive(from, blob, (message) => {
      if (rt.active()?.id === callId) heard(callId, from, message);
    });
  },

  declined(callId: string, userId: string) {
    if (rt.active()?.id === callId) declined = userId;
  },

  refused(callId: string, reason: string) {
    const a = rt.active();
    if (a?.id !== callId) return;
    const wasIn = a.phase === 'live';
    teardown();
    if (reason === 'full') return void toast.show('This call is full.', { tone: 'error' });
    if (!wasIn) return void toast.show('That call has ended.', { tone: 'error' });
    // away longer than the call waits for anyone, as when a phone slept: the way back in
    toast.show('You were away from the call for too long, so you left it.', { tone: 'error', action: { label: 'Rejoin', run: () => void rejoinCall(callId) } });
  },

  // the same person joined from another tab, which now has the call
  replaced(callId: string) {
    if (rt.active()?.id !== callId) return;
    teardown();
    toast.show('This call moved to another tab.');
  },

  // ends the call here, and tells the server this tab is out of it
  end(message: string | null) {
    const a = rt.active();
    if (!a) return;
    socket.call({ type: 'call.leave', callId: a.id });
    teardown();
    if (message) toast.show(message);
  },

  leave() {
    const a = rt.active();
    if (!a) return;
    socket.call({ type: 'call.leave', callId: a.id });
    teardown();
  },

  // after this person confirms a key, or someone publishes one, the badges follow
  refreshTrust() {
    if (!rt.active()) return;
    void keyDirectory.load().then((keys) => {
      for (const p of Object.values(rt.active()?.peers ?? {})) callPeers.trusted(p.userId, keys.get(p.userId)?.state ?? 'none', p.session);
    });
  },

  // this person chose to talk to someone whose key they haven't confirmed, for this call only
  allow(userId: string) {
    const peer = rt.active()?.peers[userId];
    if (!peer?.held) return;
    rt.patchPeer(userId, { held: false }, peer.session);
    callPeers.released(userId);
    rt.say(`${rt.name(userId)} can hear you now.`);
  },

  // tries a refused connection again, once this person has checked the key
  retry(userId: string) {
    const peer = rt.active()?.peers[userId];
    if (!peer || peer.link !== 'refused') return;
    drop(userId);
    rt.patch((a) => ({ peers: Object.fromEntries(Object.entries(a.peers).filter(([id]) => id !== userId)) }));
    connect(rt.active()!.id, userId, peer.session);
  },
};

export default callSession;
