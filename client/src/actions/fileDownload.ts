import folderFiles from './folderFiles';
import saveBlob from '../lib/saveBlob';
import safeBlobType from '../lib/safeBlobType';
import type BlobProgress from '../types/BlobProgress';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

interface Writable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
type SavePicker = (options: { suggestedName: string }) => Promise<{ createWritable(): Promise<Writable> }>;

// below this, a file is small enough to put together in memory and save the usual way
const STREAM_FROM = 256 * 1024 * 1024;

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
    const pick = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    if (!pick || item.size < STREAM_FROM) {
      saveBlob(await fileDownload.read(folder, item, opts), item.name);
      return true;
    }
    let out: Writable;
    try {
      out = await (await pick({ suggestedName: item.name })).createWritable();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false;
      throw err;
    }
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
