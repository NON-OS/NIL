import settingsStore from './settingsStore.js';

const DEFAULTS = Object.freeze({ doneDays: 0, commentDays: 0, activityDays: 0 });
const ALLOWED = Object.freeze([0, 1, 7, 30, 90, 180, 365]);

// Zero-state policies: how long finished work, comments and history are kept. 0 keeps forever.
const retention = {
  allowed: ALLOWED,
  get: () => ({ ...DEFAULTS, ...settingsStore.get('retention', {}) }),
  set(patch) {
    const next = { ...retention.get() };
    for (const key of Object.keys(DEFAULTS)) {
      if (key in patch && ALLOWED.includes(Number(patch[key]))) next[key] = Number(patch[key]);
    }
    settingsStore.set('retention', next);
    return next;
  },
};

export default retention;
