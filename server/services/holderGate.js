import config from '../config.js';
import settingsStore from './settingsStore.js';
import check from '../lib/check.js';
import cryptoTools from './cryptoTools.js';

// The open door: anyone whose wallet holds at least `minimum` NOX may join as a member.
// It's one of the crypto tools, so it closes while they're switched off.
const holderGate = {
  get() {
    const gate = settingsStore.get('holderGate', { enabled: false, minimum: null });
    return { enabled: Boolean(gate.enabled && gate.minimum && config.nox.enabled && cryptoTools.on()), minimum: gate.minimum };
  },

  set({ enabled, minimum }) {
    const amount = check.amount(minimum, 'Minimum');
    const gate = { enabled: Boolean(enabled) && Boolean(amount), minimum: amount };
    settingsStore.set('holderGate', gate);
    return holderGate.get();
  },
};

export default holderGate;
