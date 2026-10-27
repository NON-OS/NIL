import { useState, type FormEvent } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import FolderAudience from './FolderAudience';
import toast from '../../state/toast';
import folders from '../../actions/folders';
import type SharedFolder from '../../types/SharedFolder';

// A new shared folder: its name, and who can open it. Its key is made here and sealed to each of
// them whose key this person has confirmed.
export default function NewFolderModal({ onClose, onMade }: { onClose: () => void; onMade: (folder: SharedFolder) => void }) {
  const [name, setName] = useState('');
  const [audience, setAudience] = useState<'team' | 'people'>('team');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const make = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const folder = await folders.create({ name: name.trim(), audience, people: [...picked] });
      onMade(folder);
      onClose();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <Modal title="New shared folder" onClose={onClose} width={520}>
      <form onSubmit={make}>
        <div className="modal-body" style={{ display: 'grid', gap: 16 }}>
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Contracts, Design, Board papers…" autoFocus />
          </label>
          <FolderAudience audience={audience} picked={picked} onAudience={setAudience} onPicked={setPicked} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy && <Spinner size={14} />} Create folder
          </button>
        </div>
      </form>
    </Modal>
  );
}
