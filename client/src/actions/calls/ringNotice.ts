// How an incoming call makes itself heard in an open tab: a soft two-note ring, made here so
// there's no sound file to fetch, and the system notification from the push closed once the
// call is answered, declined or over.
const NOTES = [660, 880];
const EVERY_MS = 2600;

let context: AudioContext | null = null;
let timer: number | undefined;
const ringing = new Set<string>();

function chime() {
  if (!context) return;
  const now = context.currentTime;
  NOTES.forEach((freq, i) => {
    const osc = context!.createOscillator();
    const gain = context!.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.22);
    gain.gain.linearRampToValueAtTime(0.08, now + i * 0.22 + 0.03);
    gain.gain.linearRampToValueAtTime(0, now + i * 0.22 + 0.2);
    osc.connect(gain).connect(context!.destination);
    osc.start(now + i * 0.22);
    osc.stop(now + i * 0.22 + 0.22);
  });
}

function closeNotifications(callId: string) {
  void navigator.serviceWorker?.ready
    .then((reg) => reg.getNotifications({ tag: `nil-call-${callId}` }))
    .then((list) => list.forEach((n) => n.close()))
    .catch(() => {});
}

const ringNotice = {
  start(callId: string) {
    ringing.add(callId);
    if (timer !== undefined || typeof AudioContext === 'undefined') return;
    context ??= new AudioContext();
    // a tab nobody has clicked in may not play sound yet; the ring then shows without it
    void context.resume().catch(() => {});
    chime();
    timer = window.setInterval(chime, EVERY_MS);
  },

  stop(callId: string) {
    closeNotifications(callId);
    ringing.delete(callId);
    if (ringing.size) return;
    clearInterval(timer);
    timer = undefined;
    void context?.close().catch(() => {});
    context = null;
  },
};

export default ringNotice;
