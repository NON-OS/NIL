import type FolderItem from './FolderItem';

// The dialog open over a shared folder: one for the folder itself, one for a file or subfolder in
// it, or one for several picked together.
type FileDialog = { kind: 'new' | 'share' | 'renameFolder' | 'deleteFolder' } | { kind: 'rename' | 'move' | 'delete'; item: FolderItem } | { kind: 'moveMany' | 'deleteMany'; items: FolderItem[] };

export default FileDialog;
