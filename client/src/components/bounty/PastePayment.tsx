import '../plan/Plan.css';
import { useState, type FormEvent } from 'react';
import Spinner from '../ui/Spinner';
import CopyValue from '../plan/CopyValue';
import toast from '../../state/toast';
import bounties from '../../actions/bounties';
import formatUnits from '../../lib/formatUnits';
import useStore from '../../state/useStore';
import type PaymentIntent from '../../types/PaymentIntent';

const OUTCOME: Record<string, string> = {
  paid: 'Payment confirmed on-chain.',
  overpaid: 'Payment confirmed on-chain. More arrived than was asked for.',
  underpaid: 'Part of the bounty arrived. Start another payment for the rest.',
  confirming: 'Found it. It counts once its block is final.',
  sent: 'Recorded. Waiting for it to be mined.',
};

// For bounties paid outside the browser wallet, such as from a Safe multisig: Nil first gives
// the exact amount to send (its last digits identify this payment), then takes the transaction.
export default function PastePayment({ taskId, onDone }: { taskId: string; onDone?: () => void }) {
  const rewards = useStore((s) => s.rewards);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);
  const token = rewards.find((t) => t.symbol === intent?.token);

  const begin = async () => {
    setBusy(true);
    try {
      setIntent(await bounties.start(taskId));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!intent) return;
    setBusy(true);
    try {
      const payment = await bounties.record(taskId, intent.id, hash.trim());
      if (payment.status === 'failed') toast.show(payment.problem ?? 'That transaction doesn’t pay this bounty.', { tone: 'error', timeout: 9000 });
      else toast.show(OUTCOME[payment.state] ?? 'Recorded.', { tone: 'success' });
      setHash('');
      onDone?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (!intent || !token) {
    return (
      <div className="bounty-actions">
        <button type="button" className="btn" disabled={busy} onClick={begin}>
          {busy && <Spinner size={14} />} Get the exact amount to send
        </button>
      </div>
    );
  }
  const shown = formatUnits(intent.amount, token.decimals, token.decimals);
  return (
    <div className="settings-card" style={{ padding: 14 }}>
      <CopyValue label="Send exactly" value={shown.replace(/,/g, '')} shown={`${shown} ${intent.token}`} big />
      <CopyValue label="To" value={intent.to} />
      <p className="plan-fine">Send this amount, last digits included, from your wallet or a treasury address, then paste the transaction. A transfer without those digits can’t be told apart from one made for something else, so it won’t count.</p>
      <form className="bounty-paste" onSubmit={submit}>
        <input className="input" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x… transaction hash" aria-label="Transaction hash" spellCheck={false} autoComplete="off" />
        <button type="submit" className="btn" disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())}>
          {busy && <Spinner size={14} />} Record payment
        </button>
      </form>
    </div>
  );
}
