import type BlobInfo from './BlobInfo';

// A file or subfolder as the browser sees it once its details are decrypted and checked. One
// whose details don't check out is `locked`, with no name, and can't be opened here.
export default interface FolderItem {
  id: string;
  folderId: string;
  parentId: string | null;
  kind: 'file' | 'folder';
  // its own key, wrapped under the folder key
  keyWrap: string;
  name: string;
  type: string;
  // bytes before encryption
  size: number;
  width: number | null;
  height: number | null;
  hash: string | null;
  blob: BlobInfo | null;
  thumb: BlobInfo | null;
  edit: number;
  // who signed the details: whoever added it, or last renamed or moved it
  by: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  locked: boolean;
  // older details than this browser has already seen for it
  rollback: boolean;
  oldKey: string | null;
}
