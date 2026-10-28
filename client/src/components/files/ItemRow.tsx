import { ShieldAlert } from 'lucide-react';
import ItemArt from './ItemArt';
import ItemMenu from './ItemMenu';
import itemCaption from './itemCaption';
import dates from '../../lib/dates';
import fileSize from '../../lib/fileSize';
import cx from '../../lib/cx';
import type FolderItem from '../../types/FolderItem';
import type ItemHandlers from '../../types/ItemHandlers';
import type SharedFolder from '../../types/SharedFolder';
import FileName from './FileName';
import ItemCheck from './ItemCheck';

// One file or folder in the list: name, size, last change and who signed it.
export default function ItemRow({ folder, item, count, signer, handlers }: { folder: SharedFolder; item: FolderItem; count?: number; signer: string; handlers: ItemHandlers }) {
  const name = item.locked ? 'Locked file' : item.name;
  return (
    <tr className={cx('files-row', handlers.dropTarget === item.id && 'drop-target', handlers.selected(item) && 'selected')} {...handlers.drag(item)}>
      <td className="files-cell-check">
        <ItemCheck item={item} name={name} handlers={handlers} />
      </td>
      <td className="files-cell-name">
        <button type="button" className="files-open" data-item={item.id} tabIndex={handlers.tabbable(item) ? 0 : -1} onClick={(e) => handlers.onClick(item, e)} onFocus={(e) => handlers.onFocus(item, e)}>
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
      </td>
      <td className="files-cell-meta wide num">{item.kind === 'file' && !item.locked ? fileSize(item.size) : ''}</td>
      <td className="files-cell-meta wide">{dates.ago(item.updatedAt)}</td>
      <td className="files-cell-meta wide">{signer}</td>
      <td className="files-cell-actions">
        <ItemMenu item={item} canWrite={handlers.canWrite} canDelete={handlers.canDelete(item)} onAction={(a) => handlers.onAction(item, a)} />
      </td>
    </tr>
  );
}
