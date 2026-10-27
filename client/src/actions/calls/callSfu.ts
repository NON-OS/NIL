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
let roster = '';
// keys that came in before the SFU connection was up, or before the server said who sent them
let waiting: { from: string; message: unknown }[] = [];
// keys are taken one at a time, in the order they came, so a newer one never lands first
let taking: Promise<unknown> = Promise.resolve();

function flush() {
  const early = waiting;
  waiting = [];
  for (const k of early) callSfu.key(k.from, k.message);
}

const place = (callId: string) => ({ callId, workspaceKey: store.get().workspaceKey, origin: store.get().origin });

// The call this tab is in, once it's on the SFU: everyone in it, one connection to the SFU, and
// a new frame key from this browser every time someone joins or leaves.
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
    const next = others.map((m) => `${m.userId}:${m.session}`).sort().join(',');
    connecting ??= sfuLink
      .connect(place(view.id))
      .then(flush)
      .catch((err) => {
        connecting = null;
        toast.error(err);
      });
    // anyone joining or leaving: a fresh key, so the newcomer hears nothing from before and
    // whoever left hears nothing after
    if (waiting.length) void connecting.then(flush);
    if (next !== roster) {
      roster = next;
      const ids = others.map((m) => m.userId);
      void connecting.then(() => sfuKeys.rotate(ids));
    }
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
    roster = '';
    waiting = [];
    taking = Promise.resolve();
    await sfuLink.close();
  },
};

export default callSfu;
