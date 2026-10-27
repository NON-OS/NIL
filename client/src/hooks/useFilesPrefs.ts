import { useState } from 'react';
import storage from '../lib/storage';
import type ItemSort from '../types/ItemSort';

type Prefs = { mode: 'grid' | 'list'; sort: ItemSort };

const KEY = 'files:view';
const START: Prefs = { mode: 'grid', sort: { by: 'name', desc: false } };

// Grid or list, and the order, kept in this browser for every folder alike.
export default function useFilesPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...START, ...storage.get<Partial<Prefs>>(KEY, {}) }));
  const update = (patch: Partial<Prefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      storage.set(KEY, next);
      return next;
    });
  return [prefs, update] as const;
}
