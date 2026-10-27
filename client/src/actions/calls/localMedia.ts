import storage from '../../lib/storage';

export interface DevicePrefs {
  mic: string | null;
  cam: string | null;
  speaker: string | null;
}

const PREFS = 'call-devices';
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

function cameraSize(others: number): MediaTrackConstraints {
  return others <= 1 ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } : { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } };
}

const pick = (id: string | null) => (id ? { deviceId: { ideal: id } } : {});

// The microphone, camera and screen, and which of them this person picked last time.
const localMedia = {
  prefs: (): DevicePrefs => storage.get(PREFS, { mic: null, cam: null, speaker: null }),

  remember(patch: Partial<DevicePrefs>) {
    storage.set(PREFS, { ...localMedia.prefs(), ...patch });
  },

  async microphone(deviceId = localMedia.prefs().mic) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO, ...pick(deviceId) } });
    return stream.getAudioTracks()[0];
  },

  async camera(others: number, deviceId = localMedia.prefs().cam) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { ...cameraSize(others), ...pick(deviceId) } });
    const track = stream.getVideoTracks()[0];
    track.contentHint = 'motion';
    return track;
  },

  canShareScreen: () => typeof navigator.mediaDevices?.getDisplayMedia === 'function',

  async screen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
    const track = stream.getVideoTracks()[0];
    track.contentHint = 'detail';
    return track;
  },

  // Device names are only given once the page may use a camera or microphone.
  async devices() {
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    const of = (kind: MediaDeviceKind) => all.filter((d) => d.kind === kind && d.deviceId);
    return { mics: of('audioinput'), cams: of('videoinput'), speakers: of('audiooutput') };
  },

  // Speakers can be picked where the browser lets a page choose where sound goes.
  canPickSpeaker: () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype,

  stop(stream: MediaStream | null) {
    stream?.getTracks().forEach((t) => t.stop());
  },

  // What went wrong opening a device, in words a person can act on.
  problem(err: unknown, what: 'microphone' | 'camera' | 'screen') {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return what === 'screen' ? null : `Nil isn’t allowed to use your ${what}. Allow it in your browser’s site settings.`;
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return `No ${what} was found.`;
    if (name === 'NotReadableError') return `Your ${what} is in use by another app.`;
    return `Your ${what} couldn’t be opened.`;
  },
};

export default localMedia;
