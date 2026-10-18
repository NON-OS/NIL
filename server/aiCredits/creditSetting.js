import settingsStore from '../services/settingsStore.js';

// Whether members with a voting key send built-in AI requests anonymously. On unless an admin
// turns it off; members without a key always send them signed in.
const creditSetting = {
  on: () => settingsStore.get('aiCredits', {}).anonymous !== false,
  set: (anonymous) => settingsStore.set('aiCredits', { anonymous: Boolean(anonymous) }),
};

export default creditSetting;
