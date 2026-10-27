import docFacts from './docFacts';

// What whoever names a shared folder signs next to its name: the same facts a doc version
// carries (who it's for, the readers it was sealed for, the hash of the folder key, the time),
// for this folder and this version of it. Only the kind and the place differ from a doc's.
const folderFacts = {
  kind: 'nil/folder-name/v1',
  place: (folderId: string, version: number) => [folderId, version],
  list: docFacts.list,
  readers: docFacts.readers,
  parse: docFacts.parse,
};

export default folderFacts;
