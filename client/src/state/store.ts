import type State from '../types/State';
import initialState from './initialState';

let state: State = initialState;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const store = {
  get: () => state,

  set(patch: Partial<State> | ((current: State) => Partial<State>)) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
    emit();
  },

  reset(patch: Partial<State> = {}) {
    state = { ...initialState, ...patch };
    emit();
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export default store;
