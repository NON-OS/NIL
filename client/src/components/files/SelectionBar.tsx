import './Selection.css';
import { Download, FolderInput, Trash2, X } from 'lucide-react';
import type FolderItem from '../../types/FolderItem';

interface Props {
  picked: FolderItem[];
  // whether this person may move and delete every one picked
  canMove: boolean;
  canDelete: boolean;
  onDownload: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClear: () => void;
}

// In place of the toolbar while files and folders are picked: what can be done to all of them.
export default function SelectionBar({ picked, canMove, canDelete, onDownload, onMove, onDelete, onClear }: Props) {
  const openable = picked.some((i) => !i.locked);
  const why = 'Only whoever added these, the folder’s creator or an admin can move or delete them.';
  return (
    <div className="files-bar files-selection" role="toolbar" aria-label="Picked files and folders">
      <button type="button" className="icon-btn" onClick={onClear} aria-label="Clear the selection">
        <X />
      </button>
      <span className="files-selection-count num" role="status">
        {picked.length} selected
      </span>
      <button type="button" className="btn" onClick={onDownload} disabled={!openable}>
        <Download /> Download
      </button>
      <button type="button" className="btn" onClick={onMove} disabled={!canMove || !openable} title={canMove ? undefined : why}>
        <FolderInput /> Move to…
      </button>
      <button type="button" className="btn btn-danger" onClick={onDelete} disabled={!canDelete} title={canDelete ? undefined : why}>
        <Trash2 /> Delete
      </button>
    </div>
  );
}
