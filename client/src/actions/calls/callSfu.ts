import store from '../../state/store';
import toast from '../../state/toast';
import callRuntime from './callRuntime';
import callPeers from './callPeers';
import sfuLink from './sfuLink';
import sfuKeys from './sfuKeys';
import type CallView from '../../types/CallView';
import type { MediaKeyMessage } from '../../lib/crypto/callMediaKey';

const rt = callRuntime;
let connecting: Promise<void> | null = null;
// the tabs in the call last time, as `user:session`
let tabs: Set<string> | null = null;
// keys that came in before the SFU connection was up, or before the server said who sent them
let waiting: { from: string; message: unknown }[] = [];
// keys are taken one at a time, in the order they came, so a newer one never lands first
let taking: Promise<unknown> = Promise.resolve();
// a new frame key this often even when nobody joins or leaves, so a key taken from a browser
// mid-call opens only minutes of it
const ROTATE_MS = 5 * 60_000;
// Leaves that come close together share one new key, and new keys for everyone go out at most
// this often, which keeps a big call's key messages well under the server's limits. Whoever left
// is dropped from the SFU by the server straight away.
const BATCH_MS = 1500;
const GAP_MS = 6000;
let rotation: number | undefined;
let fullTimer: number | undefined;
let lastFull = 0;
let people: string[] = [];

function full() {
  clearTimeout(fullTimer);
  fullTimer = undefined;
  lastFull = Date.now();
  void connecting?.then(() => sfuKeys.rotate(people));
}

function fullSoon() {
  if (fullTimer === undefined) fullTimer = window.setTimeout(full, Math.max(BATCH_MS, lastFull + GAP_MS - Date.now()));
}

function flush() {
  const early = waiting;
  waiting = [];
  for (const k of early) callSfu.key(k.from, k.message);
}

const place = (callId: string) => ({ callId, workspaceKey: store.get().workspaceKey, origin: store.get().origin });

// The call this tab is in, once it's on the SFU: everyone in it, one connection to the SFU, and
// this browser's frame key moved on whenever someone joins (sfuKeys.ratchet) or leaves (a new
// one for everyone left), and every five minutes.
const callSfu = {
  reconcile(view: CallView, others: CallView['members']) {
    const a = rt.active();
    if (!a) return;
    for (const m of others) {
      if (a.peers[m.userId]?.session === m.session) continue;
      if (!a.peers[m.userId]) rt.say(`${rt.name(m.userId)} joined the call.`);
      callPeers.add(m.userId, m.session);
    }
    for (const userId of Object.keys(a.peers)) {
      if (others.some((m) => m.userId === userId)) continue;
      callPeers.remove(userId);
      rt.say(`${rt.name(userId)} left the call.`);
    }
    connecting ??= sfuLink
      .connect(place(view.id))
      .then(flush)
      .catch((err) => {
        connecting = null;
        toast.error(err);
      });
    if (waiting.length) void connecting.then(flush);
    // newcomers hear nothing from before they came, and whoever left nothing after
    const now = new Set(others.map((m) => `${m.userId}:${m.session}`));
    const joined = others.filter((m) => tabs && !tabs.has(`${m.userId}:${m.session}`)).map((m) => m.userId);
    const left = tabs !== null && [...tabs].some((t) => !now.has(t));
    const first = tabs === null;
    tabs = now;
    people = others.map((m) => m.userId);
    if (first) {
      full();
      rotation = window.setInterval(full, ROTATE_MS);
      return;
    }
    if (left) fullSoon();
    if (joined.length) void connecting.then(() => sfuKeys.ratchet(joined));
  },

  key(from: string, message: unknown) {
    const sender = rt.active()?.view.members.find((m) => m.userId === from);
    if (!sfuLink.active() || !sender?.sfu) return void (waiting.length < 64 && waiting.push({ from, message }));
    taking = taking.then(async () => {
      if (await sfuKeys.take(from, message as MediaKeyMessage)) sfuLink.refresh();
    }).catch(() => {});
  },

  async close() {
    connecting = null;
    tabs = null;
    clearInterval(rotation);
    clearTimeout(fullTimer);
    fullTimer = undefined;
    lastFull = 0;
    people = [];
    waiting = [];
    taking = Promise.resolve();
    await sfuLink.close();
  },
};

export default callSfu;
