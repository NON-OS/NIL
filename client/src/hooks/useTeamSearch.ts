import { useEffect, useState } from 'react';
import searchTeam from '../actions/search';
import searchWords from '../lib/searchWords';
import type SearchHit from '../types/SearchHit';

// waits for a pause in typing before asking the server
const PAUSE_MS = 200;
const MIN_LETTERS = 2;

// Server-side search of team tasks as someone types. Results only ever show for the exact
// query they answer, so a slow reply to an older query can't overwrite a newer one.
export default function useTeamSearch(query: string) {
  const [result, setResult] = useState<{ query: string; hits: SearchHit[] }>({ query: '', hits: [] });
  const q = query.trim();

  useEffect(() => {
    if (searchWords(q).join('').length < MIN_LETTERS) return;
    let stale = false;
    const timer = setTimeout(() => {
      searchTeam(q)
        .then((hits) => !stale && setResult({ query: q, hits }))
        // search is a convenience; the palette still shows what it found locally
        .catch(() => !stale && setResult({ query: q, hits: [] }));
    }, PAUSE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q]);

  return result.query === q ? result.hits : [];
}
