import { useState } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import FolderAudience from './FolderAudience';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import folders from '../../actions/folders';
import type SharedFolder from '../../types/SharedFolder';

interface Props {
  folder: SharedFolder;
  canManage: boolean;
  onClose: () => void;
  onDone: () => void;
}

// Adding people seals the folder key for them. Taking people out gives the folder a new key and
// wraps every file's key under it, so they can't open anything added from then on.
export default function ShareFolderModal({ folder, canManage, onClose, onDone }: Props) {
  const me = useStore((s) => s.me)!;
  const users = useStore((s) => s.users);
  const [audience, setAudience] = useState(folder.audience);
  const [picked, setPicked] = useState(new Set(folder.readers.filter((id) => id !== me.id)));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const everyone = Object.values(users).filter((u) => !u.deactivated && u.kind !== 'agent' && u.id !== me.id).map((u) => u.id);
      const target = audience === 'team' ? everyone : [...picked];
      // a folder whose name failed its check is only kept by moving it to a fresh key, signed by you
      const removing = folder.warning === 'unverified' || folder.readers.some((id) => id !== me.id && !target.includes(id)) || audience !== folder.audience;
      if (removing) {
        if (!canManage) throw new Error('Only the folder’s creator or an admin can take people out.');
        await folders.restrict(folder, target, audience);
        toast.show('Done. The folder has a new key, so people taken out can’t open files added from now on.', { tone: 'success' });
      } else {
        await folders.share(folder, target);
        toast.show('Shared. Their browsers can now open this folder.', { tone: 'success' });
      }
      onDone();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Who can open this folder"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <Spinner size={14} />} Save
          </button>
        </>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
        <FolderAudience audience={audience} picked={picked} onAudience={setAudience} onPicked={setPicked} readers={folder.readers} canManage={canManage} />
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          Anyone taken out keeps whatever they already downloaded or opened. A new key keeps them out of what comes after.
        </p>
      </div>
    </Modal>
  );
}
