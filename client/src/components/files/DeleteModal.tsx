import { useState } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';

interface Props {
  name: string;
  folder: boolean;
  // into its folder's trash for this many days, rather than gone at once
  trashDays?: number;
  // several picked together; `name` then says how many
  many?: boolean;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

// Deleting is for everyone, so it always asks first, and says whether it can be undone.
export default function DeleteModal({ name, folder, trashDays, many, onDelete, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={many ? `Delete ${name}?` : `Delete “${name}”?`}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={run} disabled={busy}>
            {busy && <Spinner size={14} />} {trashDays ? 'Move to trash' : 'Delete for everyone'}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <p style={{ margin: 0 }}>
          {trashDays
            ? many
              ? `They move to this shared folder’s trash for everyone who can open it, with everything inside any folders among them, and stay there for ${trashDays} days, so they can be brought back.`
              : `${folder ? 'The folder moves, with everything in it,' : 'The file moves'} to this shared folder’s trash for everyone who can open it, and stays there for ${trashDays} days, so it can be brought back.`
            : folder
              ? 'The folder and everything in it are deleted for everyone who can open them. This can’t be undone.'
              : 'The file is deleted for everyone who can open it. This can’t be undone.'}
        </p>
      </div>
    </Modal>
  );
}
