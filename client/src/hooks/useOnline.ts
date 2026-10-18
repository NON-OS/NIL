import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

// Whether the browser thinks it has a network at all. It can say yes and still not reach Nil,
// so it only ever adds to what the live connection says.
export default function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}
