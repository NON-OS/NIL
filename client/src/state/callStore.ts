import type CallState from '../types/CallState';

const initial: CallState = { settings: null, live: {}, ringing: [], active: null, devices: { open: false, join: null }, notice: null };

let state: CallState = initial;
const listeners = new Set<() => void>();

// Calls keep their own small store beside the app's, since media streams and connection
// states change many times a second and nothing else in the app needs them.
const callStore = {
  get: () => state,

  set(patch: Partial<CallState> | ((current: CallState) => Partial<CallState>)) {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    listeners.forEach((listener) => listener());
  },

  reset() {
    state = initial;
    listeners.forEach((listener) => listener());
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export default callStore;
