import '../plan/Plan.css';
import useStore from '../../state/useStore';
import isAdminUser from '../../lib/isAdmin';

const WHY: Record<string, string> = {
  unreachable: 'the server can’t reach its verifier',
  unsealed: 'answers from Ethereum aren’t coming through the server’s verifier, so its setup needs a look',
  syncing: 'the verifier is still catching up with the chain',
  checkpoint: 'the verifier’s checkpoint is too old to trust and needs replacing',
  consensus: 'the verifier can’t reach its consensus node',
  upstream: 'the Ethereum node isn’t giving answers that can be proven',
  timeout: 'checks are taking too long',
  busy: 'the verifier has more requests than it can take',
  unsupported: 'the verifier won’t prove one of the reads Nil needs',
};

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

// Shown to admins after the Ethereum node was caught in a false answer, and, when only proven
// answers count (enforce), while the server can't verify: nothing is counted or refused on an
// unchecked answer then, so this is what explains a payment that waits or a vote that won't open.
// In shadow mode Nil still went by the node, so the notice says to look at what it acted on.
export default function VerificationNotice() {
  const check = useStore((s) => s.nox?.verification);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  if (!isAdmin || !check || check.mode === 'off' || check.ok) return null;
  const at = check.mismatchAt ? `On ${when(check.mismatchAt)}, ` : '';
  if (check.reason === 'mismatch' && check.mode === 'shadow') {
    return (
      <p className="plan-callout warn" role="status">
        {at}the Ethereum node gave this server an answer that its verifier proved false. Verification is only watching for now, so Nil went by the node’s answer: check payments, invoices and votes from around then. If this notice keeps coming back, the node may be misconfigured or lying, and whoever runs the server should look at it.
      </p>
    );
  }
  if (check.reason === 'mismatch') {
    return (
      <p className="plan-callout warn" role="status">
        {at}the Ethereum node gave this server an answer that didn’t match the chain. The verifier threw it away and nothing was counted on it. Once can be a fault; if this notice keeps coming back, the node may be misconfigured or lying, and whoever runs the server should look at it.
      </p>
    );
  }
  return (
    <p className="plan-callout warn" role="status">
      Nil can’t verify what Ethereum says right now: {WHY[check.reason ?? ''] ?? 'the verifier isn’t answering with proof'}. Until it can, payments and invoices wait, new token-weighted votes don’t open and nobody joins through the holder door. Nothing is counted or turned away in the meantime{check.since ? `; this started ${when(check.since)}` : ''}.
    </p>
  );
}
