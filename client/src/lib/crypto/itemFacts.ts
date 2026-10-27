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
  // a file's sealed blob and the blob of its thumbnail, by id
  blob: string | null;
  thumb: string | null;
  // an image's size in pixels
  width: number | null;
  height: number | null;
  // the hash of the item's own key (see keyHash)
  key: string;
  // 0 when added, one more with each rename or move
  edit: number;
  at: number;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const id = (v: unknown) => v === null || (typeof v === 'string' && ID.test(v));
const pixels = (v: unknown) => v === null || factChecks.count(v, 1_000_000);

// What whoever adds, renames or moves a file or subfolder in a shared folder signs next to its
// name. Its place is the folder and the item's own id, so the server can't move it to another
// folder or show it as another item; the parent, blob, size and hash tie the details to where it
// sits and the very bytes uploaded, and the key hash to the key it was sealed under.
const itemFacts = {
  kind: 'nil/folder-item/v1',
  place: (folderId: string, itemId: string) => [folderId, itemId],
  list: (f: ItemFacts) => [f.kind, f.parent, f.type, f.size, f.hash, f.blob, f.thumb, f.width, f.height, f.key, f.edit, f.at],

  parse(list: unknown[]): ItemFacts {
    const [kind, parent, type, size, hash, blob, thumb, width, height, key, edit, at] = list;
    const shape =
      list.length === 12 &&
      (kind === 'file' || kind === 'folder') &&
      id(parent) &&
      typeof type === 'string' &&
      type.length <= 100 &&
      factChecks.count(size, Number.MAX_SAFE_INTEGER) &&
      (hash === null || factChecks.hash(hash)) &&
      id(blob) &&
      id(thumb) &&
      pixels(width) &&
      pixels(height) &&
      factChecks.hash(key) &&
      factChecks.count(edit, 2 ** 31) &&
      factChecks.time(at);
    const fitsKind = kind === 'file' ? blob !== null && hash !== null : type === '' && size === 0 && hash === null && blob === null && thumb === null && width === null && height === null;
    if (!shape || !fitsKind) throw new Error('This file carries details Nil doesn’t accept.');
    return { kind, parent, type, size, hash, blob, thumb, width, height, key, edit, at } as ItemFacts;
  },
};

export default itemFacts;
