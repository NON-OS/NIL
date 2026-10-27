import folderFiles from './folderFiles';
import fileSize from '../lib/fileSize';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';
import type UploadJob from '../types/UploadJob';

// a few files at a time, so one large file doesn't hold up the small ones behind it
const PARALLEL = 3;

type Work = { file: File; controller: AbortController; onDone?: (item: FolderItem) => void };

let jobs: UploadJob[] = [];
const work = new Map<string, Work>();
// the latest look at each folder, so a file queued before the folder got a new key goes up under
// the new one
const latest = new Map<string, SharedFolder>();
const listeners = new Set<() => void>();
let next = 0;

function set(id: string, patch: Partial<UploadJob>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  listeners.forEach((l) => l());
}

function pump() {
  while (jobs.filter((j) => j.status === 'uploading').length < PARALLEL) {
    const job = jobs.find((j) => j.status === 'queued');
    if (!job) return;
    void run(job);
  }
}

async function run(job: UploadJob) {
  const w = work.get(job.id)!;
  const folder = latest.get(job.folderId);
  set(job.id, { status: 'uploading', progress: 0, error: null });
  try {
    if (!folder) throw new Error('Open the folder again to upload here.');
    const item = await folderFiles.upload(folder, job.parentId, w.file, { signal: w.controller.signal, onProgress: (progress) => set(job.id, { progress }) });
    set(job.id, { status: 'done', progress: 1 });
    w.onDone?.(item);
  } catch (err) {
    if (w.controller.signal.aborted) set(job.id, { status: 'stopped' });
    else set(job.id, { status: 'failed', error: err instanceof Error ? err.message : 'The upload failed.' });
  } finally {
    pump();
  }
}

// Files waiting to go up, going up, and done, for the upload tray. Uploads carry on while you
// move between folders, and stop if the tab closes.
const uploadQueue = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  snapshot: () => jobs,

  seen(folder: SharedFolder) {
    latest.set(folder.id, folder);
  },

  add(folder: SharedFolder, parentId: string | null, files: File[], { maxFile, onDone }: { maxFile: number; onDone?: (item: FolderItem) => void }) {
    latest.set(folder.id, folder);
    for (const file of files) {
      const id = `u${++next}`;
      const tooLarge = maxFile > 0 && file.size > maxFile;
      work.set(id, { file, controller: new AbortController(), onDone });
      jobs = [...jobs, { id, name: file.name || 'file', size: file.size, folderId: folder.id, parentId, progress: 0, status: tooLarge ? 'failed' : 'queued', error: tooLarge ? `Larger than the ${fileSize(maxFile)} this server takes for one file.` : null }];
    }
    listeners.forEach((l) => l());
    pump();
  },

  stop(id: string) {
    const job = jobs.find((j) => j.id === id);
    work.get(id)?.controller.abort();
    if (job?.status === 'queued') set(id, { status: 'stopped' });
  },

  retry(id: string) {
    const w = work.get(id);
    if (!w) return;
    work.set(id, { ...w, controller: new AbortController() });
    set(id, { status: 'queued', progress: 0, error: null });
    pump();
  },

  // Takes finished, stopped and failed uploads off the list.
  clear() {
    const kept = jobs.filter((j) => j.status === 'queued' || j.status === 'uploading');
    for (const j of jobs) if (!kept.includes(j)) work.delete(j.id);
    jobs = kept;
    listeners.forEach((l) => l());
  },
};

export default uploadQueue;
