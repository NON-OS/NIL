import folderFiles from './folderFiles';
import saveBlob from '../lib/saveBlob';
import safeBlobType from '../lib/safeBlobType';
import filesLimits from '../lib/filesLimits';
import pickSaveFile, { type DiskWriter } from '../lib/pickSaveFile';
import type BlobProgress from '../types/BlobProgress';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

// below this, a file is small enough to put together in memory and save the usual way
const STREAM_FROM = 256 * 1024 * 1024;
const TOO_LARGE = 'This is too large for this browser to save in one go. Download it in a browser that saves files straight to disk, such as Chrome, Edge or Brave.';

// Getting a decrypted file out of a shared folder: into memory for a preview, or onto disk.
const fileDownload = {
  async read(folder: SharedFolder, item: FolderItem, opts: BlobProgress = {}) {
    const parts: Uint8Array[] = [];
    await folderFiles.each(folder, item, (plain) => void parts.push(plain), opts);
    return new Blob(parts, { type: safeBlobType(item.type) });
  },

  // A large file goes straight to disk a decrypted chunk at a time, where the browser lets a page
  // write a file in pieces, and one that fails its check at the end is thrown away before it's
  // kept. Anything else is put together in memory and handed to the downloads like any other.
  // Resolves false when the person closed the save dialog.
  async save(folder: SharedFolder, item: FolderItem, opts: BlobProgress = {}) {
    const canStream = 'showSaveFilePicker' in window;
    // a browser that can't write a file in pieces would hold all of it in memory; past what the
    // server allows for that, it's refused before the tab runs out of room
    if (!canStream && item.size > filesLimits().zipMemoryMaxBytes) throw new Error(TOO_LARGE);
    if (!canStream || item.size < STREAM_FROM) {
      saveBlob(await fileDownload.read(folder, item, opts), item.name);
      return true;
    }
    const out = (await pickSaveFile(item.name)) as DiskWriter | 'cancelled';
    if (out === 'cancelled') return false;
    try {
      await folderFiles.each(folder, item, (plain) => out.write(plain), opts);
      await out.close();
      return true;
    } catch (err) {
      await out.abort().catch(() => {});
      throw err;
    }
  },
};

export default fileDownload;
