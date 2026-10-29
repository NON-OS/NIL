import { AlertTriangle, CloudOff, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type LiveStatus from '../../../types/LiveStatus';

const LOOK = {
  saved: { icon: <ShieldCheck />, label: 'Encrypted · saved' },
  sending: { icon: <Loader2 className="spin" />, label: 'Encrypting…' },
  offline: { icon: <CloudOff />, label: 'Offline · kept here' },
  unsaved: { icon: <AlertTriangle />, label: 'Not saved' },
  readonly: { icon: <ShieldAlert />, label: 'Not verified' },
};

// Where this doc's changes stand, said in a few words.
export default function DocStatusBadge({ status }: { status: LiveStatus }) {
  const look = LOOK[status.state];
  const tip =
    status.state === 'offline'
      ? 'Nil can’t reach the server. Your changes are kept here, encrypted, and go out when it’s back.'
      : status.state === 'unsaved'
        ? `${status.problem ?? 'The server didn’t take your changes.'} They’re kept here, encrypted, and Nil keeps trying.`
        : undefined;
  return (
    <span className={`doc-status is-${status.state}`} aria-live="polite" title={tip}>
      {look.icon} {look.label}
    </span>
  );
}
