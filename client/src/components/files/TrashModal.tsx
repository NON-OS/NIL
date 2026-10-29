import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import FileIcon from './FileIcon';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import folderTrash from '../../actions/folderTrash';
import filesLimits from '../../lib/filesLimits';
import dates from '../../lib/dates';
import type FolderItem from '../../types/FolderItem';
import type SharedFolder from '../../types/SharedFolder';

interface Props {
  folder: SharedFolder;
  trash: FolderItem[];
  canManage: boolean;
  onChanged: () => void;
  onClose: () => void;
}

const DAY = 24 * 3_600_000;

// What was deleted from this shared folder, newest first: each thing deleted with what went with
// it, who deleted it, and how long it stays. Bring it back, or delete it for good.
export default function TrashModal({ folder, trash, canManage, onChanged, onClose }: Props) {
  const me = useStore((s) => s.me)!;
  const users = useStore((s) => s.users);
  const [busy, setBusy] = useState<string | null>(null);
  const roots = trash.filter((i) => i.trashRoot === i.id).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  const inside = (root: FolderItem) => trash.filter((i) => i.trashRoot === root.id && i.id !== root.id).length;
  const daysLeft = (i: FolderItem) => Math.max(0, Math.ceil(((i.deletedAt ?? 0) + filesLimits().trashMs - Date.now()) / DAY));
  const mayHandle = (i: FolderItem) => canManage || i.deletedBy === me.id || i.createdBy === me.id;

  const run = async (item: FolderItem, action: 'restore' | 'forever') => {
    setBusy(item.id);
    try {
      if (action === 'restore') await folderTrash.restore(folder, item);
      else await folderTrash.forever(folder, item);
      toast.show(action === 'restore' ? `${item.name || 'It'} is back.` : `${item.name || 'It'} is deleted for good.`, { tone: 'success' });
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Trash" onClose={onClose} width={620}>
      <div className="modal-body">
        {roots.length ? (
          <ul className="files-trash">
            {roots.map((item) => (
              <li key={item.id}>
                <FileIcon kind={item.kind} type={item.type} name={item.name} />
                <span className="files-trash-name">
                  <strong>{item.locked ? 'Locked file' : item.name}</strong>
                  <small className="muted">
                    Deleted by {users[item.deletedBy ?? '']?.name ?? 'someone'} {dates.ago(item.deletedAt ?? 0)}
                    {inside(item) ? `, with ${inside(item)} ${inside(item) === 1 ? 'thing' : 'things'} inside` : ''}. Gone for good in {daysLeft(item)} {daysLeft(item) === 1 ? 'day' : 'days'}.
                  </small>
                </span>
                {mayHandle(item) && (
                  <span className="files-trash-actions">
                    <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => run(item, 'restore')}>
                      <RotateCcw /> Restore
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost danger" disabled={busy !== null} onClick={() => run(item, 'forever')} aria-label={`Delete ${item.name || 'this'} for good`}>
                      <Trash2 />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Nothing in the trash. What you delete here stays for {Math.round(filesLimits().trashMs / DAY)} days, so it can be brought back.</p>
        )}
      </div>
    </Modal>
  );
}
