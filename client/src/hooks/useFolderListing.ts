import { useCallback, useEffect, useRef, useState } from 'react';
import folders from '../actions/folders';
import uploadQueue from '../actions/uploadQueue';
import useStore from '../state/useStore';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

type Listing = { folder: SharedFolder; items: FolderItem[]; trash: FolderItem[] };

const SETTLE = 400;

// A shared folder and everything in it, decrypted. Moving between its subfolders reuses what's
// loaded; a change announced by the server, or a newly confirmed key, loads it again.
export default function useFolderListing(folderId: string) {
  const revision = useStore((s) => s.filesRev);
  const keysRevision = useStore((s) => s.keysRev);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState('');
  const loaded = useRef<Listing | null>(null);
  loaded.current = listing;

  const has = (l: Listing | null, id: string) => Boolean(l && (l.folder.id === id || l.items.some((i) => i.id === id && i.kind === 'folder')));

  const load = useCallback(async () => {
    try {
      const next = await folders.open(folderId);
      uploadQueue.seen(next.folder);
      setListing(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This folder couldn’t be opened.');
    }
  }, [folderId]);

  useEffect(() => {
    if (!has(loaded.current, folderId)) {
      setListing(null);
      void load();
    }
  }, [folderId, load]);

  // a burst of changes, such as many files arriving at once, loads the folder once
  useEffect(() => {
    if (!loaded.current) return;
    const soon = setTimeout(() => void load(), SETTLE);
    return () => clearTimeout(soon);
  }, [revision, keysRevision]);

  // shows a change made in this tab straight away, before the server's announcement brings it
  const put = useCallback((item: FolderItem) => setListing((l) => l && { ...l, items: [...l.items.filter((i) => i.id !== item.id), item] }), []);
  // something deleted here leaves the list at once; the trash fills in when the server announces it
  const drop = useCallback((id: string) => setListing((l) => l && { ...l, items: l.items.filter((i) => i.id !== id && i.parentId !== id) }), []);
  const setFolder = useCallback((folder: SharedFolder) => setListing((l) => l && { ...l, folder }), []);

  const parent = listing && folderId !== listing.folder.id ? folderId : null;
  return { listing, error, parent, reload: load, put, drop, setFolder, missing: Boolean(listing) && !has(listing, folderId) };
}
