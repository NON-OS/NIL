import callRuntime from './callRuntime';
import callMedia from './callMedia';

const rt = callRuntime;
let wakeLock: { release: () => Promise<void> } | null = null;
let installed: (() => void) | null = null;

async function keepAwake() {
  const lock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
  if (!lock || document.visibilityState !== 'visible' || !rt.active()?.cam || wakeLock) return;
  wakeLock = await lock.request('screen').catch(() => null);
}

// A microphone or camera the system took while the tab was away (a phone call, the screen
// locking, the app going to the background) shows as interrupted, with a button to bring it
// back: phones only hand them back to a tap.
function checkTracks() {
  const { audio, camera } = rt.tracks;
  const lost = { mic: Boolean(audio && audio.readyState === 'ended'), cam: Boolean(camera && camera.readyState === 'ended') };
  if (lost.mic || lost.cam) rt.patch((a) => ({ interrupted: { mic: lost.mic || a.interrupted?.mic === true, cam: lost.cam || a.interrupted?.cam === true }, ...(lost.cam ? { cam: false } : {}) }));
}

function onVisible() {
  if (document.visibilityState !== 'visible') return;
  checkTracks();
  void keepAwake();
  // sound that stopped while the tab was away starts again
  document.querySelectorAll<HTMLAudioElement>('audio').forEach((el) => el.srcObject && el.paused && void el.play().catch(() => {}));
}

function mediaSession() {
  const session = navigator.mediaSession as (MediaSession & { setMicrophoneActive?: (on: boolean) => void; setCameraActive?: (on: boolean) => void }) | undefined;
  if (!session || typeof MediaMetadata === 'undefined') return () => {};
  // a lock screen shows this to anyone nearby, so it names nobody
  session.metadata = new MediaMetadata({ title: 'Call in Nil', artist: 'Nil' });
  const handlers: [string, () => void][] = [
    ['hangup', () => void import('./callSession').then((m) => m.default.leave())],
    ['togglemicrophone', callMedia.toggleMic],
    ['togglecamera', () => void callMedia.toggleCam()],
  ];
  for (const [action, run] of handlers) {
    try {
      session.setActionHandler(action as MediaSessionAction, run);
    } catch {}
  }
  const sync = rt.subscribeActive((a) => {
    session.setMicrophoneActive?.(a.mic);
    session.setCameraActive?.(a.cam);
    if (a.cam) void keepAwake();
  });
  return () => {
    sync();
    for (const [action] of handlers) {
      try {
        session.setActionHandler(action as MediaSessionAction, null);
      } catch {}
    }
    session.metadata = null;
  };
}

// What keeps a call going on a phone, for as long as the browser allows it: controls on the
// lock screen and in the system's media controls, the screen kept on during a video call, and a
// way back for a microphone or camera the system took away.
const callLifecycle = {
  start() {
    callLifecycle.stop();
    const dropSession = mediaSession();
    const onEnded = () => checkTracks();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    const watch = window.setInterval(onEnded, 3000);
    void keepAwake();
    installed = () => {
      dropSession();
      clearInterval(watch);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  },

  // brings back what the system took, from the button the person tapped
  async resume() {
    const lost = rt.active()?.interrupted;
    rt.patch(() => ({ interrupted: null }));
    if (lost?.mic) await callMedia.reopenMic();
    if (lost?.cam) await callMedia.toggleCam();
  },

  stop() {
    installed?.();
    installed = null;
    void wakeLock?.release().catch(() => {});
    wakeLock = null;
  },
};

export default callLifecycle;
