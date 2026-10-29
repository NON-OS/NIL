import folderFiles from './folderFiles';
import fileSize from '../lib/fileSize';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';
import type UploadJob from '../types/UploadJob';
import type UploadCarry from '../types/UploadCarry';
import http from '../api/http';

// a few files at a time, so one large file doesn't hold up the small ones behind it
const PARALLEL = 3;

type Run = (opts: { signal: AbortSignal; onProgress: (progress: number) => void }) => Promise<unknown>;
type Work = { file?: File; run?: Run; carry?: UploadCarry; controller: AbortController; onDone?: (item: FolderItem) => void };

// An upload given up for good: what it sent so far is deleted, and its key wiped.
function abandon(w: Work | undefined) {
  if (w?.carry?.main.blob) http.del(`/blobs/${w.carry.main.blob}`).catch(() => {});
  w?.carry?.key?.fill(0);
}

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

function forget(id: string) {
  jobs = jobs.filter((j) => j.id !== id);
  work.delete(id);
  listeners.forEach((l) => l());
}

function pump() {
  while (jobs.filter((j) => j.kind === 'upload' && j.status === 'uploading').length < PARALLEL) {
    const job = jobs.find((j) => j.kind === 'upload' && j.status === 'queued');
    if (!job) return;
    void run(job);
  }
}

async function run(job: UploadJob) {
  const w = work.get(job.id)!;
  const folder = latest.get(job.folderId);
  set(job.id, { status: 'uploading', progress: 0, error: null });
  const opts = { signal: w.controller.signal, onProgress: (progress: number) => set(job.id, { progress }) };
  try {
    if (w.run) {
      // a download the person called off at its save dialog leaves nothing to show
      if ((await w.run(opts)) === null) return forget(job.id);
      set(job.id, { status: 'done', progress: 1 });
      return;
    }
    if (!folder) throw new Error('Open the folder again to upload here.');
    const item = await folderFiles.upload(folder, job.parentId, w.file!, { ...opts, carry: w.carry });
    set(job.id, { status: 'done', progress: 1 });
    w.onDone?.(item);
  } catch (err) {
    if (w.controller.signal.aborted) set(job.id, { status: 'stopped' });
    else set(job.id, { status: 'failed', error: err instanceof Error ? err.message : job.kind === 'upload' ? 'The upload failed.' : 'The download failed.' });
  } finally {
    pump();
  }
}

// Files waiting to go up, going up, and done, and zips on their way down, for the tray. Both carry
// on while you move between folders, and stop if the tab closes.
const uploadQueue = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  snapshot: () => jobs,

  // the unfinished uploads this tab still holds on to, to carry on with
  held: () => new Set([...work.values()].map((w) => w.carry?.main.blob).filter((b): b is string => Boolean(b))),

  seen(folder: SharedFolder) {
    latest.set(folder.id, folder);
  },

  add(folder: SharedFolder, parentId: string | null, files: File[], { maxFile, onDone }: { maxFile: number; onDone?: (item: FolderItem) => void }) {
    latest.set(folder.id, folder);
    for (const file of files) {
      const id = `u${++next}`;
      const tooLarge = maxFile > 0 && file.size > maxFile;
      work.set(id, { file, carry: { main: { digests: [] } }, controller: new AbortController(), onDone });
      jobs = [...jobs, { id, kind: 'upload', name: file.name || 'file', size: file.size, folderId: folder.id, parentId, progress: 0, status: tooLarge ? 'failed' : 'queued', error: tooLarge ? `Larger than the ${fileSize(maxFile)} this server takes for one file.` : null }];
    }
    listeners.forEach((l) => l());
    pump();
  },

  // A download into a zip, shown in the same tray with its progress and a way to stop it. It
  // starts at once, while the click that asked for it still lets the page open a save dialog.
  track(name: string, size: number, folderId: string, task: Run) {
    const id = `u${++next}`;
    work.set(id, { run: task, controller: new AbortController() });
    const job: UploadJob = { id, kind: 'download', name, size, folderId, parentId: null, progress: 0, status: 'queued', error: null };
    jobs = [...jobs, job];
    listeners.forEach((l) => l());
    void run(job);
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
    const job = jobs.find((j) => j.id === id);
    if (job?.kind === 'download') void run(job);
    else pump();
  },

  // Takes finished, stopped and failed uploads off the list, giving up what failed ones kept.
  clear() {
    const kept = jobs.filter((j) => j.status === 'queued' || j.status === 'uploading');
    for (const j of jobs) {
      if (kept.includes(j)) continue;
      abandon(work.get(j.id));
      work.delete(j.id);
    }
    jobs = kept;
    listeners.forEach((l) => l());
  },
};

export default uploadQueue;
