import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

// Whether this tab is the one on screen. Timers meant for someone to read pause while it isn't.
export default function usePageVisible() {
  return useSyncExternalStore(subscribe, () => document.visibilityState === 'visible');
}
