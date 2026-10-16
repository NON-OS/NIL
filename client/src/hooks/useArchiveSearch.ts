import { useEffect } from 'react';
import useStore from '../state/useStore';
import archive from '../actions/archive';

// waits for a pause in typing before asking the server
const DELAY_MS = 250;

// Searches the archive for what someone types, so older finished tasks that match join the
// results as they arrive. With the keyring unlocked, sealed ones come along to be opened and
// searched in the browser.
export default function useArchiveSearch(query: string, enabled = true) {
  const unlocked = useStore((s) => s.docsUnlocked);
  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < 2) return;
    const timer = window.setTimeout(() => {
      // a failed lookup only means fewer results; what's loaded is still searched
      archive.search(q, { sealed: unlocked }).catch(() => {});
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, enabled, unlocked]);
}
