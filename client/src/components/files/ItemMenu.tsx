import '../ui/Menu.css';
import { useRef, useState } from 'react';
import { Download, Eye, FolderInput, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Popover from '../ui/Popover';
import cx from '../../lib/cx';
import type FolderItem from '../../types/FolderItem';
import type ItemAction from '../../types/ItemAction';

interface Props {
  item: FolderItem;
  canDelete: boolean;
  canWrite: boolean;
  onAction: (action: ItemAction) => void;
  className?: string;
}

// A file's or folder's actions, named in full, for touch and for anyone who'd rather not
// remember keys. Delete sits apart at the bottom.
export default function ItemMenu({ item, canDelete, canWrite, onAction, className }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const run = (action: ItemAction) => () => {
    setOpen(false);
    onAction(action);
  };
  const label = item.locked ? 'Locked file' : item.name;

  return (
    <>
      <button ref={anchor} type="button" className={cx('icon-btn', className)} onClick={() => setOpen((o) => !o)} aria-label={`Actions for ${label}`} aria-expanded={open} aria-haspopup="true">
        <MoreHorizontal />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={220} align="end">
        <div className="menu-list">
          {!item.locked && (
            <button type="button" className="menu-item" onClick={run('open')}>
              {item.kind === 'folder' ? <FolderOpen size={15} /> : <Eye size={15} />} {item.kind === 'folder' ? 'Open' : 'Preview'}
            </button>
          )}
          {!item.locked && (
            <button type="button" className="menu-item" onClick={run('download')}>
              <Download size={15} /> {item.kind === 'folder' ? 'Download as zip' : 'Download'}
            </button>
          )}
          {!item.locked && canWrite && (
            <>
              <button type="button" className="menu-item" onClick={run('rename')}>
                <Pencil size={15} /> Rename
              </button>
              <button type="button" className="menu-item" onClick={run('move')}>
                <FolderInput size={15} /> Move to…
              </button>
            </>
          )}
          {canDelete && (
            <>
              <div className="menu-divider" />
              <button type="button" className="menu-item danger" onClick={run('delete')}>
                <Trash2 size={15} /> Delete
              </button>
            </>
          )}
        </div>
      </Popover>
    </>
  );
}
