import { Copy } from 'lucide-react';
import toast from '../../state/toast';

interface Props {
  label: string;
  value: string;
  // what's shown, when it differs from what's copied (a formatted amount, a short address)
  shown?: string;
  big?: boolean;
}

// A value someone has to type into another wallet exactly, with a button that copies it.
export default function CopyValue({ label, value, shown, big = false }: Props) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.show(`${label} copied.`, { tone: 'success' });
    } catch {
      toast.show('Couldn’t reach the clipboard. Select the text and copy it.', { tone: 'error' });
    }
  };
  return (
    <div className="copy-value">
      <span className="muted copy-label">{label}</span>
      <span className={`mono copy-text${big ? ' big' : ''}`} title={value}>
        {shown ?? value}
      </span>
      <button type="button" className="btn btn-sm btn-ghost" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        <Copy /> Copy
      </button>
    </div>
  );
}
