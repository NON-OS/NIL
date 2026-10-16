import store from '../state/store';
import keyDirectory from './keyDirectory';

let waiting: { resolve: () => void; reject: (err: Error) => void } | null = null;

const declined = () => new Error('Nothing was shared: their keys aren’t confirmed yet. Check them any time in Settings, under Sign-in & security.');

// Asks this person to confirm teammates' new or changed keys before anything is sealed to them.
// The prompt (KeyCheckModal) shows each fingerprint, and the action that asked waits for the
// answer. Nothing ever confirms a key on its own.
const confirmKeys = {
  async ask(userIds: (string | null)[], reason: string) {
    const pending = await keyDirectory.pending(userIds.filter((id): id is string => Boolean(id)));
    if (!pending.length) return;
    waiting?.reject(declined());
    await new Promise<void>((resolve, reject) => {
      waiting = { resolve, reject };
      store.set({ keyCheck: { userIds: pending.map((k) => k.userId), reason } });
    });
  },

  // Opens the prompt without any action waiting on it.
  show(userIds: string[], reason: string) {
    store.set({ keyCheck: { userIds, reason } });
  },

  // `all` is true when every key shown was confirmed before the prompt closed.
  done(all: boolean) {
    store.set({ keyCheck: null });
    const w = waiting;
    waiting = null;
    if (all) w?.resolve();
    else w?.reject(declined());
  },
};

export default confirmKeys;
