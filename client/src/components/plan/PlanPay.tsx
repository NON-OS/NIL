import { useState, type FormEvent } from 'react';
import { Wallet } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import plan from '../../actions/plan';
import tokenAmount from '../../lib/tokenAmount';
import ethereum from '../../lib/ethereum';
import type PlanPayment from '../../types/PlanPayment';

const CHOICES = [1, 3, 6, 12];

function announce(payment: PlanPayment) {
  if (payment.status === 'failed') toast.show(payment.problem ?? 'That transaction doesn’t pay for the plan.', { tone: 'error' });
  else toast.show(payment.status === 'confirmed' ? `Paid. ${payment.periods} period${payment.periods === 1 ? '' : 's'} added.` : 'Sent. It counts once the network confirms it.', { tone: 'success' });
}

export default function PlanPay({ onPaid }: { onPaid: () => void }) {
  const current = useStore((s) => s.plan);
  const nox = useStore((s) => s.nox)!;
  const choices = CHOICES.filter((n) => n <= (current.maxPeriods ?? 12));
  const [periods, setPeriods] = useState(choices[0] ?? 1);
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState<'wallet' | 'hash' | null>(null);
  const total = BigInt(current.price ?? '0') * BigInt(periods);

  const run = async (kind: 'wallet' | 'hash', fn: () => Promise<PlanPayment>) => {
    setBusy(kind);
    try {
      announce(await fn());
      setHash('');
      onPaid();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };
  const paste = (e: FormEvent) => {
    e.preventDefault();
    run('hash', () => plan.record(hash.trim()));
  };

  return (
    <div className="settings-card">
      <div className="settings-row" role="radiogroup" aria-label="How long to pay for">
        {choices.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={periods === n} className={`btn btn-sm plan-choice${periods === n ? ' on' : ''}`} onClick={() => setPeriods(n)}>
            {n * (current.periodDays ?? 30)} days
          </button>
        ))}
      </div>
      <div className="settings-row plan-total">
        <span className="mono">{tokenAmount(total, nox.symbol)}</span>
        <button type="button" className="btn btn-primary" disabled={busy !== null || !ethereum.available()} onClick={() => run('wallet', () => plan.pay(periods))}>
          {busy === 'wallet' ? <Spinner size={14} /> : <Wallet />} Pay from my wallet
        </button>
      </div>
      <p className="muted plan-fine">
        Sent from your own wallet straight to the treasury, then checked on-chain. Nothing renews by itself and no card or email is ever asked for.
        {!ethereum.available() && ' No browser wallet found here: pay from any wallet and paste the transaction below.'}
      </p>
      <form className="bounty-paste" onSubmit={paste}>
        <input className="input" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Paid from a Safe? 0x… transaction hash" aria-label="Transaction hash" spellCheck={false} autoComplete="off" />
        <button type="submit" className="btn" disabled={busy !== null || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())}>
          {busy === 'hash' && <Spinner size={14} />} Record payment
        </button>
      </form>
    </div>
  );
}
