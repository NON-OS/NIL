import toast from '../../state/toast';
import callRuntime from './callRuntime';
import localMedia from './localMedia';
import audioLevels from './audioLevels';
import sfuLink from './sfuLink';

const rt = callRuntime;

function sendAll(slot: 0 | 1 | 2, track: MediaStreamTrack | null) {
  rt.links.forEach((l) => {
    l.replace(slot, track);
    l.sendState();
  });
  void sfuLink.replace((['audio', 'camera', 'screen'] as const)[slot], track);
}

function showLocal() {
  const local = rt.localStream();
  rt.patch(() => ({ local, localScreen: rt.tracks.screen ? new MediaStream([rt.tracks.screen]) : null }));
  if (rt.tracks.audio) audioLevels.watch('me', new MediaStream([rt.tracks.audio]), (speaking) => rt.patch(() => ({ speaking })));
}

async function openMic(deviceId?: string | null) {
  try {
    const track = await localMedia.microphone(deviceId);
    track.enabled = rt.active()?.mic ?? true;
    rt.tracks.audio?.stop();
    rt.tracks.audio = track;
    rt.patch(() => ({ micBlocked: false }));
    sendAll(0, track);
  } catch (err) {
    rt.patch(() => ({ micBlocked: true, mic: false }));
    toast.show(localMedia.problem(err, 'microphone') ?? 'Your microphone couldn’t be opened.', { tone: 'error' });
  }
  showLocal();
}

async function openCam(deviceId?: string | null) {
  try {
    const track = await localMedia.camera(rt.links.size, deviceId);
    rt.tracks.camera?.stop();
    rt.tracks.camera = track;
    rt.patch(() => ({ cam: true, camBlocked: false }));
    sendAll(1, track);
  } catch (err) {
    rt.patch(() => ({ cam: false, camBlocked: true }));
    toast.show(localMedia.problem(err, 'camera') ?? 'Your camera couldn’t be opened.', { tone: 'error' });
  }
  showLocal();
}

function stopScreen() {
  rt.tracks.screen?.stop();
  rt.tracks.screen = null;
  rt.patch(() => ({ screen: false }));
  sendAll(2, null);
  showLocal();
}

// The microphone, camera and screen this tab sends in the call it's in.
const callMedia = {
  async open({ video }: { video: boolean }) {
    await openMic();
    if (video) await openCam();
  },

  toggleMic() {
    const a = rt.active();
    if (!a) return;
    // a microphone that couldn't be opened before is tried again, and comes on if it opens
    if (!rt.tracks.audio) return void openMic().then(() => rt.tracks.audio && callMedia.toggleMic());
    const mic = !a.mic;
    rt.tracks.audio.enabled = mic;
    rt.patch(() => ({ mic }));
    rt.links.forEach((l) => l.sendState());
    sfuLink.mute(!mic);
    rt.say(mic ? 'Microphone on.' : 'Microphone off.');
  },

  // Turning the camera off stops it, so its light goes out too.
  async toggleCam() {
    const a = rt.active();
    if (!a) return;
    if (a.cam) {
      rt.tracks.camera?.stop();
      rt.tracks.camera = null;
      rt.patch(() => ({ cam: false }));
      sendAll(1, null);
      showLocal();
    } else {
      await openCam();
    }
    rt.say(rt.active()?.cam ? 'Camera on.' : 'Camera off.');
  },

  async toggleScreen() {
    const a = rt.active();
    if (!a) return;
    if (a.screen) return stopScreen();
    let track: MediaStreamTrack;
    try {
      track = await localMedia.screen();
    } catch (err) {
      const problem = localMedia.problem(err, 'screen');
      if (problem) toast.show(problem, { tone: 'error' });
      return;
    }
    // sharing ended from the browser's own bar
    track.addEventListener('ended', () => rt.tracks.screen === track && stopScreen());
    rt.tracks.screen = track;
    rt.patch(() => ({ screen: true, layout: 'speaker', pinned: null }));
    sendAll(2, track);
    showLocal();
    rt.say('You’re sharing your screen.');
  },

  async useDevice(kind: 'mic' | 'cam' | 'speaker', deviceId: string) {
    localMedia.remember({ [kind]: deviceId });
    if (kind === 'mic' && rt.active()) await openMic(deviceId);
    if (kind === 'cam' && rt.active()?.cam) await openCam(deviceId);
    if (kind === 'speaker') rt.patch(() => ({ speaker: deviceId }));
  },

  // after the system took the microphone: a new one, at the mute state the person had
  reopenMic: () => openMic(),

  stopAll() {
    for (const key of ['audio', 'camera', 'screen'] as const) {
      rt.tracks[key]?.stop();
      rt.tracks[key] = null;
    }
  },
};

export default callMedia;
