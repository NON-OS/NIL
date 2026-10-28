import folderFiles from './folderFiles';
import saveBlob from '../lib/saveBlob';
import filesLimits from '../lib/filesLimits';
import fileSize from '../lib/fileSize';
import zipPaths from '../lib/zipPaths';
import zipWriter from '../lib/zipWriter';
import pickSaveFile, { type DiskWriter } from '../lib/pickSaveFile';
import type BlobProgress from '../types/BlobProgress';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

// below this, a zip is small enough to put together in memory and save the usual way
const STREAM_FROM = 256 * 1024 * 1024;

// Several files, or folders with everything in them, decrypted in this tab into one zip. Each file
// is checked against what its uploader signed as it's decrypted, and a file that doesn't match
// stops the whole zip rather than leave a changed file in it. A large zip is written straight to
// disk where the browser allows that; anything else is put together in memory. Resolves with how
// many locked items were left out, or null when the person closed the save dialog.
const zipDownload = {
  async save(folder: SharedFolder, picked: FolderItem[], all: FolderItem[], name: string, { onProgress, signal }: BlobProgress = {}) {
    const { entries, locked, bytes } = zipPaths(picked, all);
    if (!entries.length) throw new Error('There’s nothing here this browser can open to put in a zip.');
    const canStream = 'showSaveFilePicker' in window;
    const { zipMemoryMaxBytes } = filesLimits();
    if (!canStream && bytes > zipMemoryMaxBytes) throw new Error(`That’s ${fileSize(bytes)}, more than this browser can put together in one go (${fileSize(zipMemoryMaxBytes)}). Download it in a browser that saves files straight to disk, such as Chrome, Edge or Brave, or pick fewer files.`);
    const toDisk = canStream && bytes >= STREAM_FROM ? ((await pickSaveFile(name)) as DiskWriter | 'cancelled') : null;
    if (toDisk === 'cancelled') return null;
    const parts: Uint8Array[] = [];
    const zip = zipWriter(toDisk ? (b) => toDisk.write(b) : (b) => void parts.push(b));
    let done = 0;
    try {
      for (const entry of entries) {
        signal?.throwIfAborted();
        if (!entry.item) {
          await zip.folder(entry.path);
          continue;
        }
        const item = entry.item;
        await zip.file(entry.path, item.size, (put) =>
          folderFiles
            .each(folder, item, put, { signal, onProgress: (p) => onProgress?.(bytes ? (done + p * item.size) / bytes : 0) })
            .catch((err) => {
              throw new Error(`${entry.path}: ${err instanceof Error ? err.message : 'it couldn’t be decrypted.'} The zip was stopped.`);
            }),
        );
        done += item.size;
      }
      await zip.end();
      if (toDisk) await toDisk.close();
      else saveBlob(new Blob(parts, { type: 'application/zip' }), name);
      onProgress?.(1);
      return locked;
    } catch (err) {
      if (toDisk) await toDisk.abort().catch(() => {});
      throw err;
    }
  },
};

export default zipDownload;
