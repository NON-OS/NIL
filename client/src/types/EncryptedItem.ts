import type BlobInfo from './BlobInfo';

// A file or subfolder in a shared folder exactly as the server returns it: its key wrapped under
// the folder key, its sealed details, and for a file its blob and thumbnail.
export default interface EncryptedItem {
  id: string;
  folderId: string;
  parentId: string | null;
  kind: 'file' | 'folder';
  keyWrap: string;
  metaCt: string;
  blob: BlobInfo | null;
  thumb: BlobInfo | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
}
