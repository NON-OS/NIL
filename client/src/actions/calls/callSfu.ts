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
// keys that came in before the SFU connection was up
let waiting: { from: string; message: unknown }[] = [];

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
      .then(() => {
        const early = waiting;
        waiting = [];
        for (const k of early) void callSfu.key(k.from, k.message);
      })
      .catch((err) => {
        connecting = null;
        toast.error(err);
      });
    // anyone joining or leaving: a fresh key, so the newcomer hears nothing from before and
    // whoever left hears nothing after
    if (next !== roster) {
      roster = next;
      const ids = others.map((m) => m.userId);
      void connecting.then(() => sfuKeys.rotate(ids));
    }
  },

  async key(from: string, message: unknown) {
    if (!sfuLink.active()) return void (waiting.length < 64 && waiting.push({ from, message }));
    if (await sfuKeys.take(from, message as MediaKeyMessage)) sfuLink.refresh();
  },

  async close() {
    connecting = null;
    roster = '';
    waiting = [];
    await sfuLink.close();
  },
};

export default callSfu;
