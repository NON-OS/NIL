import { useEffect, useRef, useState, type FormEvent } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';

interface Props {
  title: string;
  label: string;
  initial?: string;
  submit: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

// Asks for a name: a new folder's, or a new one for a file or folder. A file's name comes up with
// everything before its extension selected, so typing replaces just that.
export default function NameModal({ title, label, initial = '', submit, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dot = initial.lastIndexOf('.');
    input.current?.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await onSubmit(clean);
      onClose();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} width={440}>
      <form onSubmit={save}>
        <div className="modal-body">
          <label className="field">
            <span>{label}</span>
            <input ref={input} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy && <Spinner size={14} />} {submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
