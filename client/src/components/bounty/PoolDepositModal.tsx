import { useState, type FormEvent } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import poolDeposit from '../../actions/poolDeposit';
import parseUnits from '../../lib/parseUnits';
import tokenAmount from '../../lib/tokenAmount';
import type PoolInfo from '../../types/PoolInfo';

// Puts tokens from this admin's wallet into the token's pool. The form says plainly that the
// deposit itself is public, what the pool keeps as its vetting fee, and how long approval takes.
export default function PoolDepositModal({ info, onClose, onDone }: { info: PoolInfo; onClose: () => void; onDone: () => void }) {
  const usable = info.assets.filter((a) => a.pool && !a.problem);
  const [symbol, setSymbol] = useState(usable[0]?.symbol ?? '');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const asset = usable.find((a) => a.symbol === symbol);
  const wei = asset ? parseUnits(amount, asset.decimals) : null;
  const fee = wei && asset?.vettingFeeBps ? (BigInt(wei) * BigInt(asset.vettingFeeBps)) / 10_000n : 0n;
  const tooSmall = Boolean(wei && asset?.minimumDeposit && BigInt(wei) < BigInt(asset.minimumDeposit));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!asset || !wei) return;
    setStep('Starting');
    try {
      const outcome = await poolDeposit(asset, info.entrypoint, BigInt(wei), setStep);
      toast.show(outcome === 'mined' ? 'Deposited. It can pay bounties once the association set approves it.' : 'Sent. Nil notes the deposit once it’s mined; rebuild the pool notes if it doesn’t show up.', { tone: 'success', timeout: 8000 });
      onDone();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setStep(null);
    }
  };

  return (
    <Modal title="Deposit into the team pool" onClose={onClose} width={520}>
      <form className="modal-body" style={{ display: 'grid', gap: 14 }} onSubmit={submit}>
        <div className="settings-row">
          <select className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Token">
            {usable.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol}
              </option>
            ))}
          </select>
          <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" inputMode="decimal" aria-label="Amount" autoComplete="off" />
        </div>
        {asset && (
          <dl className="pool-terms">
            <dt>Smallest deposit</dt>
            <dd>{tokenAmount(asset.minimumDeposit ?? '0', asset.symbol, 6)}</dd>
            <dt>Vetting fee kept by the pool ({Number(asset.vettingFeeBps ?? 0) / 100}%)</dt>
            <dd>{wei ? tokenAmount(fee, asset.symbol, 6) : ''}</dd>
            <dt className="pool-total">Lands in the pool</dt>
            <dd className="pool-total">{wei ? tokenAmount(BigInt(wei) - fee, asset.symbol, 6) : ''}</dd>
          </dl>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          The deposit is public: anyone can see that this wallet put this amount into the pool. What stays private is which payouts it funds. Only this wallet can take the deposit back with a ragequit. Approval by the association set usually takes up to a week.
        </p>
        <div className="plan-notice" style={{ margin: 0 }}>
          Deposit well before you pay, and more than one bounty’s worth. A payout that leaves soon after a deposit of a similar size can be matched to it by timing and amount.
        </div>
        {tooSmall && <div className="muted" style={{ color: 'var(--danger)' }}>That’s below the pool’s smallest deposit.</div>}
        <div className="settings-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={Boolean(step)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!wei || tooSmall || Boolean(step)}>
            {step && <Spinner size={14} />} {step ?? 'Deposit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
