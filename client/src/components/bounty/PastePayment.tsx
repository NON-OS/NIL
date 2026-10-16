import { useState, type FormEvent } from 'react';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import bounties from '../../actions/bounties';

// For bounties paid outside the browser wallet, such as from a Safe multisig.
export default function PastePayment({ taskId, onDone }: { taskId: string; onDone?: () => void }) {
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payment = await bounties.record(taskId, hash.trim());
      if (payment.status === 'failed') toast.show(payment.problem ?? 'That transaction doesn’t pay this bounty.', { tone: 'error' });
      else toast.show(payment.status === 'confirmed' ? 'Payment confirmed on-chain.' : 'Recorded. Waiting for confirmations.', { tone: 'success' });
      setHash('');
      onDone?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="bounty-paste" onSubmit={submit}>
      <input className="input" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x… transaction hash" aria-label="Transaction hash" spellCheck={false} autoComplete="off" />
      <button type="submit" className="btn" disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())}>
        {busy && <Spinner size={14} />} Record payment
      </button>
    </form>
  );
}
