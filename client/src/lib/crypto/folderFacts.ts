import docFacts, { type DocFacts } from './docFacts';
import factChecks from './factChecks';

export interface FolderFacts extends DocFacts {
  // which of the folder's keys this is, counting from 1, so an older key can't pass for the newest
  keyRev: number | null;
  // every item's details in the folder are encrypted under keys bound to this folder key
  bound: boolean;
  version: 1 | 2;
}

const KIND = 'nil/folder-name/v2';
const OLDER = 'nil/folder-name/v1';

// What whoever names a shared folder signs next to its name: who it's for, the readers it was
// sealed for, the hash of the folder key and the time, as for a doc version, and from format 2
// on also which key of the folder's it is and whether every item's details are bound to it.
// Format 1 names, from before, carry the doc's four facts alone.
const folderFacts = {
  kind: KIND,
  place: (folderId: string, version: number) => [folderId, version],
  list: (f: Omit<FolderFacts, 'version'>) => [f.audience, f.readers, f.key, f.at, f.keyRev, f.bound],
  readers: docFacts.readers,

  parse(list: unknown[]): FolderFacts {
    if (list.length === 4) return { ...docFacts.parse(list), keyRev: null, bound: false, version: 1 };
    const [audience, readers, key, at, keyRev, bound] = list;
    const base = docFacts.parse([audience, readers, key, at]);
    if (list.length !== 6 || !factChecks.count(keyRev, 2 ** 31) || keyRev < 1 || typeof bound !== 'boolean') throw new Error('This folder carries details Nil doesn’t accept.');
    return { ...base, keyRev, bound, version: 2 };
  },

  // what a signature on these facts has to cover
  statement: (folderId: string, version: number, f: FolderFacts) =>
    f.version === 2 ? { kind: KIND, place: folderFacts.place(folderId, version), facts: folderFacts.list(f) } : { kind: OLDER, place: folderFacts.place(folderId, version), facts: docFacts.list(f) },
};

export default folderFacts;
