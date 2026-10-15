import { useState } from 'react';
import storage from '../lib/storage';
import type GroupKey from '../types/GroupKey';
import type SortKey from '../types/SortKey';

export default function useListPrefs(viewKey: string, initial: { groupBy: GroupKey; sortBy: SortKey }) {
  const [prefs, setPrefs] = useState(() => storage.get(`list:${viewKey}`, initial));
  const update = (patch: Partial<typeof prefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      storage.set(`list:${viewKey}`, next);
      return next;
    });
  return [prefs, update] as const;
}
