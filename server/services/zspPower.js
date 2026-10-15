import config from '../config.js';
import settingsStore from './settingsStore.js';

// Voting power per Zero-State Pass, in whole NOX. Admins set it; the server default applies until then.
const zspPower = {
  get: () => settingsStore.get('votePower', {}).zspPower ?? config.power.zspPower,
  set(value) {
    settingsStore.set('votePower', { zspPower: value });
    return value;
  },
};

export default zspPower;
