import factChecks from './factChecks';

export interface ItemFacts {
  kind: 'file' | 'folder';
  // the subfolder it sits in, or null at the top of the shared folder
  parent: string | null;
  // a file's type, its length before encryption and its content hash (see blobHash); a folder
  // has '', 0 and null
  type: string;
  size: number;
  hash: string | null;
  // a file's sealed blob, the blob holding its chunks' hashes (for more than one chunk), and its
  // thumbnail with the thumbnail's own content hash and length
  blob: string | null;
  hashes: string | null;
  thumb: string | null;
  thumbHash: string | null;
  thumbSize: number | null;
  // an image's size in pixels
  width: number | null;
  height: number | null;
  // the hash of the item's own key (see keyHash)
  key: string;
  // 0 when added, one more with each rename, move or re-encryption
  edit: number;
  at: number;
  // 1 for details from before thumbnails and chunk lists were signed
  version: 1 | 2;
}

const KIND = 'nil/folder-item/v2';
const OLDER = 'nil/folder-item/v1';
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const id = (v: unknown) => v === null || (typeof v === 'string' && ID.test(v));
const pixels = (v: unknown) => v === null || factChecks.count(v, 1_000_000);

// What whoever adds, renames, moves or re-encrypts a file or subfolder in a shared folder signs
// next to its name. Its place is the folder and the item's own id, so the server can't move it to
// another folder or show it as another item; the parent, blobs, sizes and hashes tie the details
// to where it sits and the very bytes uploaded, its thumbnail's included, and the key hash to the
// key it was sealed under. Format 1, from before, signed the thumbnail's id but not its bytes.
const itemFacts = {
  kind: KIND,
  place: (folderId: string, itemId: string) => [folderId, itemId],
  list: (f: Omit<ItemFacts, 'version'>) => [f.kind, f.parent, f.type, f.size, f.hash, f.blob, f.hashes, f.thumb, f.thumbHash, f.thumbSize, f.width, f.height, f.key, f.edit, f.at],
  olderList: (f: ItemFacts) => [f.kind, f.parent, f.type, f.size, f.hash, f.blob, f.thumb, f.width, f.height, f.key, f.edit, f.at],

  statement: (folderId: string, itemId: string, f: ItemFacts) => ({ kind: f.version === 2 ? KIND : OLDER, place: itemFacts.place(folderId, itemId), facts: f.version === 2 ? itemFacts.list(f) : itemFacts.olderList(f) }),

  parse(list: unknown[]): ItemFacts {
    const older = list.length === 12;
    const [kind, parent, type, size, hash, blob, hashes, thumb, thumbHash, thumbSize, width, height, key, edit, at] = older ? [list[0], list[1], list[2], list[3], list[4], list[5], null, list[6], null, null, ...list.slice(7)] : list;
    const shape =
      (older || list.length === 15) &&
      (kind === 'file' || kind === 'folder') &&
      id(parent) &&
      typeof type === 'string' &&
      type.length <= 100 &&
      factChecks.count(size, Number.MAX_SAFE_INTEGER) &&
      (hash === null || factChecks.hash(hash)) &&
      id(blob) &&
      id(hashes) &&
      id(thumb) &&
      (thumbHash === null || factChecks.hash(thumbHash)) &&
      (thumbSize === null || factChecks.count(thumbSize, Number.MAX_SAFE_INTEGER)) &&
      (thumbHash === null) === (thumbSize === null) &&
      (thumb !== null || thumbHash === null) &&
      pixels(width) &&
      pixels(height) &&
      factChecks.hash(key) &&
      factChecks.count(edit, 2 ** 31) &&
      factChecks.time(at);
    const fitsKind = kind === 'file' ? blob !== null && hash !== null : type === '' && size === 0 && hash === null && blob === null && hashes === null && thumb === null && width === null && height === null;
    if (!shape || !fitsKind) throw new Error('This file carries details Nil doesn’t accept.');
    return { kind, parent, type, size, hash, blob, hashes, thumb, thumbHash, thumbSize, width, height, key, edit, at, version: older ? 1 : 2 } as ItemFacts;
  },
};

export default itemFacts;
