import { useMemo, useState } from 'react';
import { Folder, FolderLock } from 'lucide-react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import type FolderItem from '../../types/FolderItem';
import type SharedFolder from '../../types/SharedFolder';

interface Props {
  folder: SharedFolder;
  items: FolderItem[];
  item: FolderItem;
  onMove: (parentId: string | null) => Promise<void>;
  onClose: () => void;
}

// Where to move a file or folder, for anyone not dragging: the top of the shared folder or any
// subfolder in it, nested as they are. A folder can't go inside itself.
export default function MoveModal({ folder, items, item, onMove, onClose }: Props) {
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    const subfolders = items.filter((i) => i.kind === 'folder' && !i.locked);
    const inside = new Set<string>([item.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of subfolders) {
        if (f.parentId && inside.has(f.parentId) && !inside.has(f.id)) {
          inside.add(f.id);
          grew = true;
        }
      }
    }
    const out: { id: string | null; name: string; depth: number }[] = [{ id: null, name: folder.name, depth: 0 }];
    const walk = (parent: string | null, depth: number) => {
      for (const f of subfolders.filter((s) => s.parentId === parent && !inside.has(s.id)).sort((a, b) => a.name.localeCompare(b.name))) {
        out.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    return out;
  }, [folder.name, items, item.id]);

  const move = async () => {
    if (target === undefined) return;
    setBusy(true);
    try {
      await onMove(target);
      onClose();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Move “${item.name}”`}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={move} disabled={busy || target === undefined}>
            {busy && <Spinner size={14} />} Move here
          </button>
        </>
      }
    >
      <div className="modal-body">
        <ul className="files-move-list" aria-label="Folders">
          {options.map((o) => (
            <li key={o.id ?? 'top'}>
              <button type="button" className="files-move-option" style={{ paddingLeft: 8 + o.depth * 18 }} aria-pressed={target === o.id} disabled={o.id === item.parentId} onClick={() => setTarget(o.id)}>
                {o.id === null ? <FolderLock aria-hidden="true" /> : <Folder aria-hidden="true" />}
                <span>{o.name}</span>
                {o.id === item.parentId && <small className="muted">here now</small>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
