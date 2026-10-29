import { useEffect, useState, type RefObject } from 'react';
import folderFiles from '../actions/folderFiles';
import thumbCache from '../state/thumbCache';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

// a few thumbnails decrypted at a time, so scrolling a big folder doesn't flood the server
const AT_ONCE = 4;
let running = 0;
const waiting: (() => void)[] = [];

async function inTurn<T>(task: () => Promise<T>) {
  if (running >= AT_ONCE) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

// A file's thumbnail as a blob: URL, fetched and decrypted the first time its tile scrolls into
// view, or null while there's none.
export default function useThumbnail(folder: SharedFolder, item: FolderItem, ref: RefObject<HTMLElement>) {
  const id = item.thumb?.id ?? null;
  const [url, setUrl] = useState(() => (id ? (thumbCache.get(id) ?? null) : null));

  useEffect(() => {
    if (!id || item.locked) return;
    const cached = thumbCache.get(id);
    if (cached) return setUrl(cached);
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let live = true;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      inTurn(() => folderFiles.thumbnail(folder, item))
        .then((blob) => {
          if (!blob) return;
          const made = thumbCache.get(id) ?? URL.createObjectURL(blob);
          thumbCache.put(id, made);
          if (live) setUrl(made);
        })
        .catch(() => {});
    }, { rootMargin: '200px' });
    seen.observe(el);
    return () => {
      live = false;
      seen.disconnect();
    };
    // a new folder key or a new thumbnail is what matters; the objects change on every load
  }, [id, item.locked, folder.keyHash]);

  return url;
}
