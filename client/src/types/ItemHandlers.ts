import type { DragEvent, FocusEvent, MouseEvent } from 'react';
import type FolderItem from './FolderItem';
import type ItemAction from './ItemAction';

// What a tile or a row in a folder needs from the view around it: whether this person may change
// or delete the item, where focus sits, what's selected, and the drag handlers that move items and
// drop files.
export default interface ItemHandlers {
  canWrite: boolean;
  // whether anything is selected, which turns a click into picking
  selecting: boolean;
  selected: (item: FolderItem) => boolean;
  // `range` picks everything from the last one picked to this one
  onSelect: (item: FolderItem, range: boolean) => void;
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
