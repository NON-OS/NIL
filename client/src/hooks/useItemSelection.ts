import { useEffect, useRef, useState } from 'react';
import type FolderItem from '../types/FolderItem';

// Which of the files and folders shown are picked, for doing something to several at once. A
// pick toggles one; a range pick adds everything from the last one toggled to this one, in the
// order shown. Picking starts over whenever `reset` changes: another folder, subfolder or search.
export default function useItemSelection(shown: FolderItem[], reset: unknown[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    setSelected(new Set());
    anchor.current = null;
  }, reset);

  const picked = shown.filter((i) => selected.has(i.id));

  return {
    picked,
    isPicked: (item: FolderItem) => selected.has(item.id),
    select(item: FolderItem, range: boolean) {
      const from = range && anchor.current ? shown.findIndex((i) => i.id === anchor.current) : -1;
      setSelected((now) => {
        const next = new Set(now);
        if (from >= 0) {
          const to = shown.findIndex((i) => i.id === item.id);
          for (const i of shown.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(i.id);
        } else if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      if (from < 0) anchor.current = item.id;
    },
    all: () => setSelected(new Set(shown.map((i) => i.id))),
    // everything, or nothing when everything is picked already
    toggleAll: () => setSelected(new Set(picked.length === shown.length ? [] : shown.map((i) => i.id))),
    clear: () => setSelected(new Set()),
  };
}
