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
  // the list of its chunks' hashes, for a file of more than one chunk
  hashes: BlobInfo | null;
  thumb: BlobInfo | null;
  // the thumbnail's signed hash and length; a thumbnail without them is never shown
  thumbHash: string | null;
  thumbSize: number | null;
  edit: number;
  // who signed the details, and when: whoever added it, or last renamed, moved or re-encrypted it
  by: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  locked: boolean;
  // older details than this browser has already seen for it
  rollback: boolean;
  // details from before thumbnails were signed, or not yet bound to the folder key
  olderFormat: boolean;
  oldKey: string | null;
  // still under a key someone taken out of the folder may hold, waiting to be encrypted again
  waiting: boolean;
  // in the folder's trash: when, by whom, and the item whose deletion took it there
  deletedAt: number | null;
  deletedBy: string | null;
  trashRoot: string | null;
}
