import type BlobInfo from './BlobInfo';

// A file or subfolder in a shared folder exactly as the server returns it: its key wrapped under
// the folder key, its sealed details, and for a file its blob, chunk list and thumbnail. `keyRev`
// is the folder key its own key was made under; something deleted carries when, by whom, and the
// item whose deletion took it to the trash.
export default interface EncryptedItem {
  id: string;
  folderId: string;
  parentId: string | null;
  kind: 'file' | 'folder';
  keyWrap: string;
  keyRev: number;
  metaCt: string;
  blob: BlobInfo | null;
  thumb: BlobInfo | null;
  hashes: BlobInfo | null;
  deletedAt: number | null;
  deletedBy: string | null;
  trashRoot: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
}
