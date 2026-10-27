import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import confirmKeys from '../../actions/confirmKeys';
import type CallPeer from '../../types/CallPeer';

// Whether the key this call is checked against is one this person confirmed with its owner.
// An unconfirmed key still connects, as it does for Docs, but says so, with the same check.
export default function TrustBadge({ peer, name }: { peer: CallPeer; name: string }) {
  if (peer.trust === 'unknown') return null;
  if (peer.trust === 'confirmed') {
    return (
      <span className="call-trust ok" title={`You confirmed ${name}’s key`}>
        <ShieldCheck aria-hidden="true" /> <span className="sr-only">Key confirmed</span>
      </span>
    );
  }
  if (peer.trust === 'none') {
    return (
      <span className="call-trust bad" title={`${name} hasn’t set up encryption keys`}>
        <ShieldAlert aria-hidden="true" /> <span>No keys</span>
      </span>
    );
  }
  const label = peer.trust === 'changed' ? 'Key changed' : 'Unverified';
  return (
    <button type="button" className={`call-trust ${peer.trust === 'new' ? 'warn' : 'bad'}`} onClick={() => confirmKeys.show([peer.userId], 'this call')} aria-label={`${label}: check ${name}’s keys`}>
      {peer.trust === 'new' ? <ShieldQuestion aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}
