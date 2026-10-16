import settingsStore from '../services/settingsStore.js';

const KEY = 'firstRun';

// The getting-started card belongs to whoever set the workspace up. Setup writes the entry;
// workspaces from before the card existed have none, so their people never see it.
const firstRunState = {
  start(userId) {
    settingsStore.set(KEY, { userId, dismissed: false, quickAdd: false, sample: null });
  },

  // the entry, but only for the person it belongs to
  of(userId) {
    const state = settingsStore.get(KEY, null);
    return state && state.userId === userId ? state : null;
  },

  update(userId, patch) {
    const state = firstRunState.of(userId);
    if (!state) return null;
    const next = { ...state, ...patch };
    settingsStore.set(KEY, next);
    return next;
  },
};

export default firstRunState;
