import type FolderItem from './FolderItem';

// The dialog open over a shared folder: one for the folder itself, or one for a file or
// subfolder in it.
type FileDialog = { kind: 'new' | 'share' | 'renameFolder' | 'deleteFolder' } | { kind: 'rename' | 'move' | 'delete'; item: FolderItem };

export default FileDialog;
