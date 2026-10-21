import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import askAi from '../../actions/askAi';
import AiMode from '../ai/AiMode';
import useAiProviderName from '../../hooks/useAiProviderName';

interface Props {
  title: string;
  body: string;
  onClose: () => void;
  onDraft: (text: string) => void;
}

// The one place encrypted text may leave the browser, so the dialog says exactly what goes.
export default function DraftModal({ title, body, onClose, onDraft }: Props) {
  const [instruction, setInstruction] = useState('');
  const [useDoc, setUseDoc] = useState(body.trim().length > 0);
  const [busy, setBusy] = useState(false);
  const provider = useAiProviderName();

  const draft = async () => {
    setBusy(true);
    try {
      const { text } = await askAi<{ text: string }>('draft', { instruction, title, context: useDoc ? body : '' });
      onDraft(text);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Draft with AI"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={draft} disabled={busy || !instruction.trim()}>
            {busy ? <Spinner size={14} /> : <Sparkles />} Draft
          </button>
        </>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
        <label className="field">
          <span>What should Claude write?</span>
          <textarea className="textarea" rows={4} autoFocus value={instruction} maxLength={4000} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. A one-page launch plan with goals, timeline, owners and risks" />
        </label>
        {body.trim() && (
          <label className="filter-toggle">
            <button type="button" className="toggle" role="switch" aria-checked={useDoc} onClick={() => setUseDoc(!useDoc)} aria-label="Use this doc as context" />
            Use what’s already in this doc as context
          </label>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          This doc is end-to-end encrypted, but a draft request isn’t. Your instruction{useDoc ? ' and the doc’s current text go' : ' goes'} to this Nil server as readable text, and the server passes them on to {provider} without storing them. The draft comes back the same way and is encrypted in your browser before it’s saved.
        </p>
        <AiMode />
      </div>
    </Modal>
  );
}
