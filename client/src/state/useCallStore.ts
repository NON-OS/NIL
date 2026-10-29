import { useSyncExternalStore } from 'react';
import type CallState from '../types/CallState';
import callStore from './callStore';

// Selectors must return something stable (a slice or a primitive), not a fresh array.
export default function useCallStore<T>(selector: (state: CallState) => T): T {
  return useSyncExternalStore(callStore.subscribe, () => selector(callStore.get()));
}
