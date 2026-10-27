import { CloudOff, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type LiveStatus from '../../../types/LiveStatus';

const LOOK = {
  saved: { icon: <ShieldCheck />, label: 'Encrypted · saved' },
  sending: { icon: <Loader2 className="spin" />, label: 'Encrypting…' },
  offline: { icon: <CloudOff />, label: 'Offline · kept here' },
  readonly: { icon: <ShieldAlert />, label: 'Not verified' },
};

// Where this doc's changes stand, said in a few words.
export default function DocStatusBadge({ status }: { status: LiveStatus }) {
  const look = LOOK[status.state];
  const tip = status.state === 'offline' ? 'Nil can’t reach the server. Your changes stay in this tab and go out when it’s back. Keep the tab open.' : undefined;
  return (
    <span className={`doc-status is-${status.state}`} aria-live="polite" title={tip}>
      {look.icon} {look.label}
    </span>
  );
}
