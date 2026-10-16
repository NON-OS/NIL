import { useMemo, useSyncExternalStore } from 'react';
import router from '../lib/router';

export default function useRoute() {
  const snapshot = useSyncExternalStore(router.subscribe, router.snapshot);
  return useMemo(() => {
    const url = new URL(snapshot, location.origin);
    return { path: url.pathname, segments: url.pathname.split('/').filter(Boolean), query: url.searchParams };
  }, [snapshot]);
}
