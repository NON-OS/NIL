import { Check, Copy } from 'lucide-react';
import copyText from '../../lib/copyText';

// A key or secret straight after it was made. It isn't kept anywhere in the browser; leaving the
// page loses it, and the only way back is to make a new one.
export default function SecretOnce({ label, value }: { label: string; value: string }) {
  return (
    <div className="key-once" role="status">
      <Check size={16} />
      <div>
        <strong>{label} Copy it now. It won’t be shown again.</strong>
        <code className="mono">{value}</code>
      </div>
      <button type="button" className="btn btn-sm" onClick={() => copyText(value)}>
        <Copy /> Copy
      </button>
    </div>
  );
}
