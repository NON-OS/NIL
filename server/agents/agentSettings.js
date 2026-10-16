import settingsStore from '../services/settingsStore.js';

// The workspace-wide switch for every agent at once. Off means agent keys are refused, no run
// starts, queued and running work is cancelled and no webhook goes out.
const agentSettings = {
  get() {
    const stored = settingsStore.get('agents', {});
    return { enabled: stored.enabled !== false, changedAt: stored.changedAt ?? null, changedBy: stored.changedBy ?? null };
  },

  set(enabled, by) {
    settingsStore.set('agents', { enabled: Boolean(enabled), changedAt: Date.now(), changedBy: by });
    return agentSettings.get();
  },

  enabled: () => agentSettings.get().enabled,
};

export default agentSettings;
