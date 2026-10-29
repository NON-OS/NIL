import http from '../api/http';
import itemKeyWrap from '../lib/crypto/itemKeyWrap';
import itemSubkey from '../lib/crypto/itemSubkey';
import blobHash from '../lib/crypto/blobHash';
import blobTransfer from './blobTransfer';
import folders from './folders';
import folderItemSeal from './folderItemSeal';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

const CHANGED = 'This file isn’t the one its uploader signed, so it wasn’t encrypted again.';

// One item encrypted again under a fresh key of its own: for a file, its contents and chunk list
// copied chunk by chunk under the new key and checked against the hash its uploader signed on the
// way, and its thumbnail too where that was signed; then its key wrapped under the folder key and
// its details signed again, as whoever did this. Only then does the server swap the copies in.
async function resealOne(folder: SharedFolder, item: FolderItem, signal?: AbortSignal) {
  const folderKey = folders.writable(folder, 'encrypt files again');
  const old = await itemKeyWrap.unwrap(folderKey, folder.id, item.id, item.keyWrap);
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  const scope = { kind: 'folder' as const, id: folder.id };
  const made: string[] = [];
  try {
    const parts: { blobId?: string; thumbId?: string; hashesId?: string } = {};
    let change = {};
    if (item.kind === 'file' && item.blob && item.hash) {
      const hash = blobHash();
      const blobId = await blobTransfer.copy(item.blob, old, fresh, scope, { replaces: item.blob.id, signal, onPlain: hash.add });
      made.push(blobId);
      if (hash.done() !== item.hash) throw new Error(CHANGED);
      await blobTransfer.finish(blobId);
      parts.blobId = blobId;
      // a file of several chunks keeps, or gains, its list of their hashes
      if (item.blob.chunks > 1) {
        // the file checked out chunk by chunk above, so its list is made afresh from what was read
        parts.hashesId = await blobTransfer.put(new Blob([hash.list()]), itemSubkey(fresh, 'hashes'), scope, { signal, part: 'hashes' });
        made.push(parts.hashesId);
      }
      // a thumbnail nobody signed is left behind rather than carried over
      if (item.thumb && item.thumbHash) {
        const th = blobHash();
        parts.thumbId = await blobTransfer.copy(item.thumb, itemSubkey(old, 'thumb'), itemSubkey(fresh, 'thumb'), scope, { replaces: item.thumb.id, signal, onPlain: th.add });
        made.push(parts.thumbId);
        if (th.done() !== item.thumbHash) throw new Error(CHANGED);
        await blobTransfer.finish(parts.thumbId);
      }
      change = { blob: parts.blobId, hashes: parts.hashesId ?? null, thumb: parts.thumbId ?? null, thumbHash: parts.thumbId ? item.thumbHash : null, thumbSize: parts.thumbId ? item.thumbSize : null };
    }
    const keyWrap = await itemKeyWrap.wrap(folderKey, folder.id, item.id, fresh);
    const metaCt = await folderItemSeal.seal(folderKey, item, fresh, item.name, folderItemSeal.facts(item, fresh, change));
    await http.post(`/folders/${folder.id}/items/${item.id}/reseal`, { keyRev: folder.keyRev, keyWrap, metaCt, ...parts });
  } catch (err) {
    for (const id of made) http.del(`/blobs/${id}`).catch(() => {});
    throw err;
  } finally {
    old.fill(0);
    fresh.fill(0);
  }
}

// After someone is taken out of a folder, every file and subfolder in it is encrypted again under
// a fresh key by the browsers of the people who stay, a few at a time, so a key the person kept
// opens nothing the server still holds. Each browser claims a few waiting items, so two people
// with the folder open share the work. `onProgress` hears how many still wait. Items that can't
// be opened here are left for someone who can, or for the folder's managers to delete.
const folderReseal = {
  async run(folder: SharedFolder, { onProgress, signal }: { onProgress?: (left: number) => void; signal?: AbortSignal } = {}) {
    const skipped = new Set<string>();
    for (;;) {
      signal?.throwIfAborted();
      const { items: ids, left } = await http.post<{ items: string[]; left: number }>(`/folders/${folder.id}/reseal/claim`);
      onProgress?.(left);
      const todo = ids.filter((id) => !skipped.has(id));
      if (!todo.length) return left;
      const listing = await folders.open(folder.id);
      folder = listing.folder;
      const all = new Map([...listing.items, ...listing.trash].map((i) => [i.id, i]));
      for (const id of todo) {
        const item = all.get(id);
        if (!item || item.locked) {
          skipped.add(id);
          continue;
        }
        await resealOne(folder, item, signal);
      }
    }
  },
};

export default folderReseal;
