import folderFiles from './folderFiles';
import uploadQueue from './uploadQueue';
import filesLimits from '../lib/filesLimits';
import toast from '../state/toast';
import type { Dropped } from '../lib/droppedFiles';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

interface Where {
  // the subfolder it goes into, how deep that sits, and how many items the shared folder holds now
  parentId: string | null;
  depth: number;
  held: number;
  maxFile: number;
  put: (item: FolderItem) => void;
}

// Files dropped or picked with the folders they sit in: the folders are made first, each encrypted
// and signed like one made by hand, and then the files go into the upload queue, into their own
// folders. Checked against how deep folders nest and how many items a shared folder holds before
// anything is made.
export default async function uploadTree(folder: SharedFolder, dropped: Dropped[], { parentId, depth, held, maxFile, put }: Where) {
  const { depthMax, folderItemsMax } = filesLimits();
  const key = (path: string[]) => path.join('/');
  const folders = new Map<string, string[]>();
  for (const { path } of dropped) for (let n = 1; n <= path.length; n++) folders.set(key(path.slice(0, n)), path.slice(0, n));
  const files = dropped.filter((d) => d.file);
  if (held + folders.size + files.length > folderItemsMax) throw new Error(`That’s ${folders.size + files.length} files and folders, more than this shared folder has room for (${folderItemsMax} in all).`);
  const deepest = Math.max(0, ...[...folders.values()].map((p) => p.length));
  if (depth + deepest > depthMax) throw new Error(`Those folders nest deeper than the ${depthMax} levels a shared folder allows.`);

  if (folders.size > 3) toast.show(`Encrypting ${folders.size} folders…`);
  const made = new Map<string, string>();
  // parents before children
  for (const path of [...folders.values()].sort((a, b) => a.length - b.length)) {
    const into = path.length > 1 ? made.get(key(path.slice(0, -1)))! : parentId;
    const item = await folderFiles.newFolder(folder, into, path.at(-1)!);
    put(item);
    made.set(key(path), item.id);
  }
  const groups = new Map<string | null, File[]>();
  for (const d of files) {
    const into = d.path.length ? made.get(key(d.path))! : parentId;
    groups.set(into, [...(groups.get(into) ?? []), d.file!]);
  }
  for (const [into, list] of groups) uploadQueue.add(folder, into, list, { maxFile, onDone: put });
}
