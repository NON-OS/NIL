import { useSyncExternalStore } from 'react';
import type State from '../types/State';
import store from './store';

// Selectors must return something stable (a slice or a primitive), not a fresh array.
export default function useStore<T>(selector: (state: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
