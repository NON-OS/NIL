import { useCallback, useState } from 'react';
import storage from '../lib/storage';
import defaultFilter from '../lib/defaultFilter';
import type TaskFilter from '../types/TaskFilter';

// Each view remembers its own filters on this device.
export default function useFilter(viewKey: string) {
  const [filter, setFilterState] = useState<TaskFilter>(() => ({ ...defaultFilter, ...storage.get<Partial<TaskFilter>>(`filter:${viewKey}`, {}), query: '' }));
  const setFilter = useCallback(
    (patch: Partial<TaskFilter>) =>
      setFilterState((current) => {
        const next = { ...current, ...patch };
        const { query, ...persisted } = next;
        storage.set(`filter:${viewKey}`, persisted);
        return next;
      }),
    [viewKey],
  );
  return [filter, setFilter] as const;
}
