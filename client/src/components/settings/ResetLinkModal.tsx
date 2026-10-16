import './SignInResets.css';
import { Copy } from 'lucide-react';
import Modal from '../ui/Modal';
import QrCode from '../ui/QrCode';
import toast from '../../state/toast';
import dates from '../../lib/dates';

interface Props {
  name: string;
  url: string;
  expiresAt: number;
  onClose: () => void;
}

// The one time an admin sees a reset link. Shown as text to send and as a code to scan in person.
export default function ResetLinkModal({ name, url, expiresAt, onClose }: Props) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show(`Link copied. Send it to ${name} privately.`, { tone: 'success' });
    } catch {
      toast.show('Couldn’t reach the clipboard. Select the link and copy it.', { tone: 'error' });
    }
  };

  return (
    <Modal title={`Sign-in reset for ${name}`} onClose={onClose} width={480}>
      <div className="modal-body reset-link">
        <p>
          Send this link to {name} privately, or let them scan the code with their phone. It works once, until {dates.dateTime(expiresAt)}. Whoever opens it can sign in as {name}, so check it reaches the right person.
        </p>
        <div className="invite-link">
          <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Reset link" />
          <button type="button" className="btn" onClick={copy}>
            <Copy /> Copy
          </button>
        </div>
        <QrCode value={url} label={`QR code with the sign-in reset link for ${name}`} size={176} />
      </div>
    </Modal>
  );
}
