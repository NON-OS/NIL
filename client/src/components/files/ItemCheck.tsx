import './Selection.css';
import type FolderItem from '../../types/FolderItem';
import type ItemHandlers from '../../types/ItemHandlers';

// The box that picks a file or folder for something done to several at once. Shift picks
// everything from the last one picked. Keyboard users pick with Space on the item itself, so the
// box stays out of the Tab order.
export default function ItemCheck({ item, name, handlers }: { item: FolderItem; name: string; handlers: ItemHandlers }) {
  return (
    <input
      type="checkbox"
      className="files-check"
      tabIndex={-1}
      checked={handlers.selected(item)}
      onClick={(e) => {
        e.stopPropagation();
        handlers.onSelect(item, e.shiftKey);
      }}
      onChange={() => {}}
      aria-label={`Select ${name}`}
    />
  );
}
