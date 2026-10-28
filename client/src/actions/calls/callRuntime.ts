import store from '../../state/store';
import callStore from '../../state/callStore';
import type ActiveCall from '../../types/ActiveCall';
import type CallPeer from '../../types/CallPeer';
import type peerLink from './peerLink';
import type { LinkTracks } from './peerLink';

type Link = ReturnType<typeof peerLink>;

// What the call this tab is in holds outside the store: a connection per person, the tracks
// being sent, and the name this tab gave itself for the call.
const links = new Map<string, Link>();
const tracks: LinkTracks = { audio: null, camera: null, screen: null };
let session = '';

const callRuntime = {
  links,
  tracks,
  session: () => session,
  setSession: (next: string) => (session = next),

  me: () => store.get().me?.id ?? '',
  name: (userId: string) => store.get().users[userId]?.name ?? 'Someone',
  active: () => callStore.get().active,

  patch(fn: (a: ActiveCall) => Partial<ActiveCall>) {
    callStore.set((s) => (s.active ? { active: { ...s.active, ...fn(s.active) } } : {}));
  },

  // Changes what's shown for one person, as long as it's still the same tab of theirs.
  patchPeer(userId: string, patch: Partial<CallPeer>, fromSession?: string) {
    callRuntime.patch((a) => {
      const peer = a.peers[userId];
      if (!peer || (fromSession && peer.session !== fromSession)) return {};
      const everConnected = a.everConnected || patch.link === 'connected';
      return { peers: { ...a.peers, [userId]: { ...peer, ...patch } }, everConnected };
    });
  },

  // calls `fn` with the call each time it changes, until the returned function is called
  subscribeActive(fn: (a: ActiveCall) => void) {
    let last: ActiveCall | null = null;
    return callStore.subscribe(() => {
      const a = callStore.get().active;
      if (a && a !== last) fn(a);
      last = a;
    });
  },

  // A line for screen readers, read out once.
  say(text: string) {
    callStore.set((s) => ({ notice: { id: (s.notice?.id ?? 0) + 1, text } }));
  },

  // the local camera and microphone, as one stream for the self view and the meters
  localStream() {
    const list = [tracks.audio, tracks.camera].filter((t): t is MediaStreamTrack => Boolean(t));
    return list.length ? new MediaStream(list) : null;
  },
};

export default callRuntime;
