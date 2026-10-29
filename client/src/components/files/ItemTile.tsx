import { ShieldAlert } from 'lucide-react';
import ItemArt from './ItemArt';
import ItemMenu from './ItemMenu';
import itemCaption from './itemCaption';
import cx from '../../lib/cx';
import type FolderItem from '../../types/FolderItem';
import type ItemHandlers from '../../types/ItemHandlers';
import type SharedFolder from '../../types/SharedFolder';
import FileName from './FileName';
import ItemCheck from './ItemCheck';

// One file or folder in the grid: its thumbnail or icon, its name and a line about it. The whole
// tile opens it, or picks it while others are picked; its box picks it; its menu has the rest.
export default function ItemTile({ folder, item, count, handlers }: { folder: SharedFolder; item: FolderItem; count?: number; handlers: ItemHandlers }) {
  const name = item.locked ? 'Locked file' : item.name;
  return (
    <li className={cx('files-tile', handlers.dropTarget === item.id && 'drop-target', handlers.selected(item) && 'selected')} {...handlers.drag(item)}>
      <ItemCheck item={item} name={name} handlers={handlers} />
      <button
        type="button"
        className="files-open"
        data-item={item.id}
        tabIndex={handlers.tabbable(item) ? 0 : -1}
        onClick={(e) => handlers.onClick(item, e)}
        onFocus={(e) => handlers.onFocus(item, e)}
        title={item.locked ? 'Nil can’t confirm who added this, so it stays locked.' : name}
      >
        <ItemArt folder={folder} item={item} />
        <span className="files-name">
          <FileName name={name} file={item.kind === 'file' && !item.locked} />
          {handlers.selected(item) && <span className="sr-only">, selected</span>}
          <small>
            {item.rollback && <ShieldAlert className="files-warn" aria-label="Older than a version seen before" />}
            <span className="num">{itemCaption(item, count)}</span>
          </small>
        </span>
      </button>
      <ItemMenu className="files-more" item={item} canWrite={handlers.canWrite} canDelete={handlers.canDelete(item)} onAction={(a) => handlers.onAction(item, a)} />
    </li>
  );
}
