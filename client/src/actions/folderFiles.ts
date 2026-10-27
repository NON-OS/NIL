import http from '../api/http';
import ApiError from '../api/ApiError';
import store from '../state/store';
import keyring from '../state/keyring';
import itemFacts, { type ItemFacts } from '../lib/crypto/itemFacts';
import itemKeyWrap from '../lib/crypto/itemKeyWrap';
import itemMeta from '../lib/crypto/itemMeta';
import itemSubkey from '../lib/crypto/itemSubkey';
import signedFacts from '../lib/crypto/signedFacts';
import blobHash from '../lib/crypto/blobHash';
import keyHash from '../lib/crypto/keyHash';
import b64u from '../lib/crypto/b64u';
import cleanFile from '../lib/cleanFile';
import imageCanvas from '../lib/imageCanvas';
import blobTransfer from './blobTransfer';
import folders from './folders';
import readFolder from './readFolder';
import type BlobProgress from '../types/BlobProgress';
import type EncryptedItem from '../types/EncryptedItem';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

// the longer edge of a thumbnail, in pixels: sharp on a phone's grid at twice the density
const THUMB_SIDE = 320;
// how much of an upload's progress bar the file takes; the thumbnail and adding it take the rest
const FILE_SHARE = 0.95;

const freshId = () => b64u.encode(crypto.getRandomValues(new Uint8Array(16)));

// The signed, encrypted details of an item, under its own key.
function sealMeta(item: { id: string; folderId: string }, key: Uint8Array, name: string, facts: ItemFacts) {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your keys first.');
  const payload = signedFacts.seal(name, { kind: itemFacts.kind, place: itemFacts.place(item.folderId, item.id), facts: itemFacts.list(facts), by: store.get().me!.id, signingPrivate: id.signingPrivate });
  return itemMeta.seal(key, item.folderId, item.id, payload);
}

// Adds a new item, wrapping its key under the folder key as it stands, and returns it opened. If
// the folder got a new key meanwhile, it's opened again and the key wrapped under the new one.
async function add(folder: SharedFolder, body: Record<string, unknown> & { id: string }, key: Uint8Array) {
  for (let attempt = 0; ; attempt++) {
    const folderKey = folders.writable(folder, 'add files');
    const keyWrap = await itemKeyWrap.wrap(folderKey, folder.id, body.id, key);
    try {
      const { item } = await http.post<{ item: EncryptedItem }>(`/folders/${folder.id}/items`, { ...body, keyRev: folder.keyRev, keyWrap });
      return readFolder.item(folderKey, item);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409) || attempt) throw err;
      folder = (await folders.open(folder.id)).folder;
    }
  }
}

async function withItemKey<T>(folder: SharedFolder, item: FolderItem, use: (key: Uint8Array) => Promise<T>) {
  if (item.locked) throw new Error('This file can’t be opened in this browser.');
  const folderKey = readFolder.keyOf(folder);
  if (!folderKey) throw new Error('Open the folder again first.');
  const key = await itemKeyWrap.unwrap(folderKey, folder.id, item.id, item.keyWrap);
  try {
    return await use(key);
  } finally {
    key.fill(0);
  }
}

// Changes an item's name or place: its details signed again, by whoever changed them, with one
// more edit, under its own key. The file itself doesn't change.
async function update(folder: SharedFolder, item: FolderItem, change: { name?: string; parentId?: string | null }) {
  const folderKey = folders.writable(folder, 'change it');
  const parentId = change.parentId === undefined ? item.parentId : change.parentId;
  const res = await withItemKey(folder, item, async (key) => {
    const facts: ItemFacts = { kind: item.kind, parent: parentId, type: item.type, size: item.size, hash: item.hash, blob: item.blob?.id ?? null, thumb: item.thumb?.id ?? null, width: item.width, height: item.height, key: keyHash(key), edit: item.edit + 1, at: Date.now() };
    const metaCt = await sealMeta(item, key, change.name ?? item.name, facts);
    return http.patch<{ item: EncryptedItem }>(`/folders/${folder.id}/items/${item.id}`, { parentId, metaCt });
  });
  return readFolder.item(folderKey, res.item);
}

// Files and subfolders inside shared folders. Each file is encrypted under a fresh key of its own,
// which is also its blob's key; its details are signed by whoever adds it and encrypted under a
// key derived from it; and only that key is wrapped under the folder's key.
const folderFiles = {
  async upload(folder: SharedFolder, parentId: string | null, file: File, { onProgress, signal }: BlobProgress = {}): Promise<FolderItem> {
    folders.writable(folder, 'add files');
    const clean = await cleanFile(file);
    const scope = { kind: 'folder' as const, id: folder.id };
    const key = crypto.getRandomValues(new Uint8Array(32));
    const hash = blobHash();
    const uploaded: string[] = [];
    try {
      const blob = await blobTransfer.put(clean.body, key, scope, { signal, onPlain: hash.add, onProgress: (p) => onProgress?.(p * FILE_SHARE) });
      uploaded.push(blob);
      const small = imageCanvas.thumbnails(clean.mime) ? await imageCanvas.thumbnail(clean.body, THUMB_SIDE) : null;
      const thumb = small ? await blobTransfer.put(small, itemSubkey(key, 'thumb'), scope, { signal }) : null;
      if (thumb) uploaded.push(thumb);
      const id = freshId();
      const facts: ItemFacts = { kind: 'file', parent: parentId, type: clean.mime, size: clean.body.size, hash: hash.done(), blob, thumb, width: clean.width, height: clean.height, key: keyHash(key), edit: 0, at: Date.now() };
      const metaCt = await sealMeta({ id, folderId: folder.id }, key, clean.name, facts);
      signal?.throwIfAborted();
      const item = await add(folder, { id, kind: 'file', parentId, metaCt, blobId: blob, thumbId: thumb }, key);
      onProgress?.(1);
      return item;
    } catch (err) {
      for (const blob of uploaded) http.del(`/blobs/${blob}`).catch(() => {});
      throw err;
    } finally {
      key.fill(0);
    }
  },

  async newFolder(folder: SharedFolder, parentId: string | null, name: string): Promise<FolderItem> {
    const key = crypto.getRandomValues(new Uint8Array(32));
    try {
      const id = freshId();
      const facts: ItemFacts = { kind: 'folder', parent: parentId, type: '', size: 0, hash: null, blob: null, thumb: null, width: null, height: null, key: keyHash(key), edit: 0, at: Date.now() };
      const metaCt = await sealMeta({ id, folderId: folder.id }, key, name, facts);
      return await add(folder, { id, kind: 'folder', parentId, metaCt }, key);
    } finally {
      key.fill(0);
    }
  },

  rename: (folder: SharedFolder, item: FolderItem, name: string) => update(folder, item, { name }),
  move: (folder: SharedFolder, item: FolderItem, parentId: string | null) => update(folder, item, { parentId }),

  async remove(folder: SharedFolder, item: FolderItem) {
    await http.del(`/folders/${folder.id}/items/${item.id}`);
  },

  // Decrypts a file chunk by chunk, handing each chunk on, and checks the whole against the size
  // and hash its uploader signed. A file that doesn't match throws at the end.
  each(folder: SharedFolder, item: FolderItem, sink: (plain: Uint8Array) => void | Promise<void>, opts: BlobProgress = {}) {
    return withItemKey(folder, item, async (key) => {
      if (!item.blob || !item.hash) throw new Error('This isn’t a file.');
      const hash = blobHash();
      let size = 0;
      await blobTransfer.each(item.blob, key, async (plain) => {
        size += plain.length;
        await hash.add(plain);
        await sink(plain);
      }, opts);
      if (size !== item.size || hash.done() !== item.hash) throw new Error('This file isn’t the one its uploader signed. It may have been changed on the server.');
    });
  },

  // The small copy shown in the grid, or null for a file without one.
  thumbnail(folder: SharedFolder, item: FolderItem, signal?: AbortSignal) {
    const thumb = item.thumb;
    if (!thumb) return Promise.resolve(null);
    return withItemKey(folder, item, async (key) => {
      const parts: Uint8Array[] = [];
      await blobTransfer.each(thumb, itemSubkey(key, 'thumb'), (plain) => void parts.push(plain), { signal });
      const webp = new TextDecoder().decode(parts[0]?.subarray(8, 12)) === 'WEBP';
      return new Blob(parts, { type: webp ? 'image/webp' : 'image/png' });
    });
  },
};

export default folderFiles;
