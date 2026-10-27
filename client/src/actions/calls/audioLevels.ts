// Who is speaking, measured in this browser from the sound itself, for the speaking ring and
// the speaker layout. Nothing about it is sent anywhere.
const THRESHOLD = 0.035;
// how long a voice counts as still speaking after it drops, so the ring doesn't flicker
const HOLD_MS = 450;
const EVERY_MS = 120;

let context: AudioContext | null = null;
const watched = new Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; data: Float32Array; speaking: boolean; heard: number; level: number; onChange: (speaking: boolean) => void }>();
let timer: number | undefined;

function tick() {
  const now = Date.now();
  for (const w of watched.values()) {
    w.analyser.getFloatTimeDomainData(w.data);
    let sum = 0;
    for (const v of w.data) sum += v * v;
    w.level = Math.sqrt(sum / w.data.length);
    if (w.level > THRESHOLD) w.heard = now;
    const speaking = now - w.heard < HOLD_MS;
    if (speaking !== w.speaking) {
      w.speaking = speaking;
      w.onChange(speaking);
    }
  }
}

const audioLevels = {
  // Starts listening to one stream's sound under `key`, replacing whatever was there.
  watch(key: string, stream: MediaStream, onChange: (speaking: boolean) => void) {
    audioLevels.unwatch(key);
    if (!stream.getAudioTracks().length || typeof AudioContext === 'undefined') return;
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    watched.set(key, { analyser, source, data: new Float32Array(analyser.fftSize), speaking: false, heard: 0, level: 0, onChange });
    timer ??= window.setInterval(tick, EVERY_MS);
  },

  // the latest loudness, 0 to about 1, for the microphone meter in the device check
  level: (key: string) => watched.get(key)?.level ?? 0,

  unwatch(key: string) {
    const w = watched.get(key);
    if (!w) return;
    w.source.disconnect();
    watched.delete(key);
    if (!watched.size) {
      clearInterval(timer);
      timer = undefined;
    }
  },

  stopAll() {
    for (const key of [...watched.keys()]) audioLevels.unwatch(key);
    void context?.close().catch(() => {});
    context = null;
  },
};

export default audioLevels;
