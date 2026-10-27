import callApi from './callApi';
import callRuntime from './callRuntime';
import iceConfig from './iceConfig';
import sfuKeys from './sfuKeys';
import audioLevels from './audioLevels';
import type { LinkPlace } from '../../lib/crypto/callLink';
import type CallPeer from '../../types/CallPeer';

type LiveKit = typeof import('livekit-client');
type Room = import('livekit-client').Room;
type Publication = import('livekit-client').LocalTrackPublication;

const rt = callRuntime;
let room: Room | null = null;
let lk: LiveKit | null = null;
const published = new Map<'audio' | 'camera' | 'screen', Publication>();
// whose sound the speaking ring listens to, by track
const hearing = new Map<string, string>();

const SOURCES = { audio: 'microphone', camera: 'camera', screen: 'screen_share' } as const;

// Every remote track a participant sends, as the peer's two streams: sound and camera, and screen.
function streamsOf(participant: import('livekit-client').RemoteParticipant): Partial<CallPeer> {
  const tracks = [...participant.trackPublications.values()].filter((p) => p.track && p.isSubscribed);
  const main = tracks.filter((p) => p.source !== 'screen_share').map((p) => p.track!.mediaStreamTrack);
  const screen = tracks.filter((p) => p.source === 'screen_share').map((p) => p.track!.mediaStreamTrack);
  const live = (source: string) => tracks.some((p) => p.source === source && !p.isMuted);
  return { media: main.length ? new MediaStream(main) : null, screenMedia: screen.length ? new MediaStream(screen) : null, mic: live('microphone'), cam: live('camera'), screen: live('screen_share') };
}

// Shows each person on the SFU by the name they signed for, and nothing for a name nobody has.
// Anyone whose key hasn't come shows as not letting this person hear them yet.
function refresh() {
  if (!room) return;
  const up = room.state === 'connected';
  for (const peer of Object.values(rt.active()?.peers ?? {})) {
    if (peer.link !== 'refused') rt.patchPeer(peer.userId, { link: up ? 'connected' : 'connecting', holding: !sfuKeys.has(peer.userId) }, peer.session);
  }
  for (const participant of room.remoteParticipants.values()) {
    const userId = sfuKeys.userOf(participant.identity);
    const peer = userId ? rt.active()?.peers[userId] : null;
    if (!peer) continue;
    const patch = streamsOf(participant);
    const sound = patch.media?.getAudioTracks()[0];
    if (sound && hearing.get(userId!) !== sound.id) {
      hearing.set(userId!, sound.id);
      audioLevels.watch(`peer:${userId}`, patch.media!, (speaking) => rt.patchPeer(userId!, { speaking }, peer.session));
    }
    rt.patchPeer(userId!, { ...patch, quality: null }, peer.session);
  }
}

function linkAll(link: CallPeer['link']) {
  for (const peer of Object.values(rt.active()?.peers ?? {})) if (peer.link !== 'refused') rt.patchPeer(peer.userId, { link }, peer.session);
}

// A call on the SFU. Frames are encrypted in this browser before they leave it, under keys only
// the people in the call hold (sfuKeys), and the SFU is reached only through the relay, like
// everyone else in a call: it forwards what it can't read to people it can't name.
const sfuLink = {
  async connect(place: LinkPlace) {
    lk ??= await import('livekit-client');
    if (!lk.isE2EESupported()) throw new Error('This call is too big to go browser to browser, and this browser can’t encrypt it end to end on the server that carries big calls. Join from a recent Chrome, Edge, Firefox or Safari.');
    const grant = await callApi.sfu(place.callId);
    const provider = new (class extends lk.BaseKeyProvider {
      constructor() {
        super({ sharedKey: false, ratchetWindowSize: 0, failureTolerance: -1, keyringSize: 16 });
      }
      async put(identity: string, raw: Uint8Array, index: number) {
        this.onSetEncryptionKey(await lk!.createKeyMaterialFromBuffer(raw.slice().buffer), identity, index);
      }
    })();
    sfuKeys.start(place, grant.identity, provider);
    const worker = new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), { type: 'module' });
    room = new lk.Room({ e2ee: { keyProvider: provider, worker }, adaptiveStream: true, dynacast: true });
    await room.setE2EEEnabled(true);
    room
      .on(lk.RoomEvent.TrackSubscribed, refresh)
      .on(lk.RoomEvent.TrackUnsubscribed, refresh)
      .on(lk.RoomEvent.TrackMuted, refresh)
      .on(lk.RoomEvent.TrackUnmuted, refresh)
      .on(lk.RoomEvent.ParticipantConnected, refresh)
      .on(lk.RoomEvent.Reconnecting, () => linkAll('reconnecting'))
      .on(lk.RoomEvent.Reconnected, () => linkAll('connected'));
    await room.connect(grant.url, grant.token, { rtcConfig: iceConfig.current(), autoSubscribe: true });
    refresh();
    for (const kind of ['audio', 'camera', 'screen'] as const) await sfuLink.replace(kind, rt.tracks[kind]);
  },

  // a key, or a name for one, has just arrived: the people it belongs to may show now
  refresh,

  async replace(kind: 'audio' | 'camera' | 'screen', track: MediaStreamTrack | null) {
    if (!room || !lk) return;
    const current = published.get(kind);
    if (current?.track?.mediaStreamTrack === track) return;
    if (current?.track) await room.localParticipant.unpublishTrack(current.track, false).catch(() => {});
    published.delete(kind);
    if (track) published.set(kind, await room.localParticipant.publishTrack(track, { source: SOURCES[kind] as import('livekit-client').Track.Source }));
  },

  // muted on the SFU too, so the others see it: there's no channel of our own there to say so
  mute(muted: boolean) {
    const pub = published.get('audio');
    if (pub) void (muted ? pub.mute() : pub.unmute()).catch(() => {});
  },

  async close() {
    const leaving = room;
    room = null;
    published.clear();
    hearing.clear();
    sfuKeys.stop();
    await leaving?.disconnect().catch(() => {});
  },

  active: () => room !== null,
};

export default sfuLink;
