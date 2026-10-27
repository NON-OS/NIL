import config from '../config.js';
import settingsStore from '../services/settingsStore.js';

// The workspace's call settings, and what the app needs to know before offering a call.
// Direct connections are off unless an admin turns them on: with them, browsers in a call may
// reach each other without the relay, so each learns the others' IP addresses.
const callSettings = {
  direct: () => settingsStore.get('calls', { direct: false }).direct === true,

  setDirect(direct, by) {
    settingsStore.set('calls', { direct: Boolean(direct), changedAt: Date.now(), changedBy: by });
  },

  // Calls work when they're on, and either the relay is set up or direct connections are allowed.
  status() {
    const { enabled, onion, turn, maxPeers, ringSeconds } = config.calls;
    const direct = callSettings.direct();
    let reason = null;
    if (!enabled) reason = onion ? 'tor' : 'off';
    else if (!turn.configured && !direct) reason = 'no-relay';
    return { available: reason === null, reason, relay: turn.configured, direct, maxPeers, ringSeconds };
  },
};

export default callSettings;
