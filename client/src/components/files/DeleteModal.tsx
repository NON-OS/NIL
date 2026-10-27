import { useState } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';

interface Props {
  name: string;
  folder: boolean;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

// Deleting is for everyone and can't be undone, so it always asks first.
export default function DeleteModal({ name, folder, onDelete, onClose }: Props) {
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
      title={`Delete “${name}”?`}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={run} disabled={busy}>
            {busy && <Spinner size={14} />} Delete for everyone
          </button>
        </>
      }
    >
      <div className="modal-body">
        <p style={{ margin: 0 }}>{folder ? 'The folder and everything in it are deleted for everyone who can open them. This can’t be undone.' : 'The file is deleted for everyone who can open it. This can’t be undone.'}</p>
      </div>
    </Modal>
  );
}
