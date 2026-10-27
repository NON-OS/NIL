import { useSyncExternalStore } from 'react';
import chatState, { type ChatState } from './chatState';

// Selectors must return something stable (a slice or a primitive), not a fresh array.
export default function useChat<T>(selector: (state: ChatState) => T): T {
  return useSyncExternalStore(chatState.subscribe, () => selector(chatState.get()));
}
