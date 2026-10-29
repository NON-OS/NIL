import { useEffect, useRef, useState } from 'react';
import folderReseal from '../actions/folderReseal';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

// Encrypts again, in the background, whatever in this folder still waits after someone was taken
// out, while the folder is open and this browser may write to it. Says how many still wait, and
// what went wrong if it stopped.
export default function useFolderReseal(folder: SharedFolder | undefined, items: FolderItem[], trash: FolderItem[]) {
  const waiting = [...items, ...trash].filter((i) => i.waiting).length;
  const [left, setLeft] = useState<number | null>(null);
  const [problem, setProblem] = useState('');
  const running = useRef(false);

  useEffect(() => {
    if (!folder || folder.warning || !waiting || running.current) return;
    const stop = new AbortController();
    running.current = true;
    setProblem('');
    folderReseal
      .run(folder, { signal: stop.signal, onProgress: setLeft })
      .then((rest) => setLeft(rest))
      .catch((err) => !stop.signal.aborted && setProblem(err instanceof Error ? err.message : 'Encrypting files again stopped.'))
      .finally(() => (running.current = false));
    return () => stop.abort();
  }, [folder?.id, folder?.keyRev, folder?.warning, waiting > 0]);

  return { waiting: left ?? waiting, problem };
}
