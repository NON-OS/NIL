import store from './store';
import chatState from './chatState';

// Opened chat epoch keys, by conversation and epoch. In this tab's memory only, and wiped with
// everything chat has opened as soon as the keys lock.
const keys = new Map<string, Uint8Array>();
const slot = (channelId: string, epoch: number) => `${channelId}/${epoch}`;

function wipe() {
  for (const key of keys.values()) key.fill(0);
  keys.clear();
}

let unlocked = store.get().docsUnlocked;
store.subscribe(() => {
  const now = store.get().docsUnlocked;
  if (unlocked && !now) {
    wipe();
    chatState.reset();
  }
  unlocked = now;
});

const chatKeyring = {
  get: (channelId: string, epoch: number) => keys.get(slot(channelId, epoch)) ?? null,
  put: (channelId: string, epoch: number, key: Uint8Array) => keys.set(slot(channelId, epoch), key),
  forget(channelId: string) {
    for (const [name, key] of keys) {
      if (!name.startsWith(`${channelId}/`)) continue;
      key.fill(0);
      keys.delete(name);
    }
  },
  // keys a forward-secret conversation let go of go here too
  forgetUpTo(channelId: string, epoch: number) {
    for (const [name, key] of keys) {
      const [id, e] = name.split('/');
      if (id !== channelId || Number(e) > epoch) continue;
      key.fill(0);
      keys.delete(name);
    }
  },
  wipe,
};

export default chatKeyring;
