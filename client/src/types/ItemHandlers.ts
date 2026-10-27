import type { DragEvent, FocusEvent, MouseEvent } from 'react';
import type FolderItem from './FolderItem';
import type ItemAction from './ItemAction';

// What a tile or a row in a folder needs from the view around it: whether this person may change
// or delete the item, where focus sits, and the drag handlers that move items and drop files.
export default interface ItemHandlers {
  canWrite: boolean;
  canDelete: (item: FolderItem) => boolean;
  tabbable: (item: FolderItem) => boolean;
  dropTarget: string | null;
  onAction: (item: FolderItem, action: ItemAction) => void;
  onFocus: (item: FolderItem, e: FocusEvent) => void;
  onClick: (item: FolderItem, e: MouseEvent) => void;
  drag: (item: FolderItem) => {
    draggable: boolean;
    onDragStart?: (e: DragEvent) => void;
    onDragEnd?: (e: DragEvent) => void;
    onDragOver?: (e: DragEvent) => void;
    onDragLeave?: (e: DragEvent) => void;
    onDrop?: (e: DragEvent) => void;
  };
}
