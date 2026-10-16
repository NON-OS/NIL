import { useEffect, useState } from 'react';
import Spinner from '../ui/Spinner';
import PriceRows from './PriceRows';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import plan from '../../actions/plan';
import formatUnits from '../../lib/formatUnits';
import usd from '../../lib/usd';
import type Invoice from '../../types/Invoice';
import type Quote from '../../types/Quote';

const CHOICES = [1, 3, 6, 12];

// Picks what to pay for and shows the price as it would be invoiced now, discounts and all,
// before anything is made or sent.
export default function InvoiceForm({ onCreated }: { onCreated: (invoice: Invoice) => void }) {
  const status = useStore((s) => s.plan);
  const periodDays = status.periodDays ?? 30;
  const choices = CHOICES.filter((n) => n <= (status.maxPeriods ?? 12));
  const seatsRunning = Boolean(status.paidUntil && status.paidUntil > Date.now() && status.source === 'paid');
  const covered = Math.max(status.seatLimit ?? 0, status.freeSeats ?? 0);
  const [kind, setKind] = useState<'periods' | 'seats'>('periods');
  const [periods, setPeriods] = useState(choices[0] ?? 1);
  const [people, setPeople] = useState(Math.max(status.seatsUsed ?? 1, status.freeSeats ?? 1));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind === 'seats' && people <= covered) setPeople(covered + 1);
  }, [kind, people, covered]);

  // a short pause so typing a number doesn't ask the server on every keystroke
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      plan
        .quote({ kind, periods, people })
        .then((q) => current && (setQuote(q), setProblem('')))
        .catch((err) => current && (setQuote(null), setProblem(err instanceof Error ? err.message : 'Couldn’t price that.')));
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kind, periods, people]);

  const create = async () => {
    setBusy(true);
    try {
      onCreated(await plan.create({ kind, periods, people }));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-card">
      {seatsRunning && (
        <div className="settings-row" role="radiogroup" aria-label="What to pay for">
          <button type="button" role="radio" aria-checked={kind === 'periods'} className={`btn btn-sm plan-choice${kind === 'periods' ? ' on' : ''}`} onClick={() => setKind('periods')}>
            More time
          </button>
          <button type="button" role="radio" aria-checked={kind === 'seats'} className={`btn btn-sm plan-choice${kind === 'seats' ? ' on' : ''}`} onClick={() => setKind('seats')}>
            More seats now
          </button>
        </div>
      )}
      {kind === 'periods' && (
        <div className="settings-row" role="radiogroup" aria-label="How long to pay for">
          {choices.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={periods === n} className={`btn btn-sm plan-choice${periods === n ? ' on' : ''}`} onClick={() => setPeriods(n)}>
              {n * periodDays} days
            </button>
          ))}
        </div>
      )}
      <label className="bounty-input" style={{ maxWidth: 320 }}>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>People covered</span>
        <input className="input" type="number" min={kind === 'seats' ? covered + 1 : status.seatsUsed ?? 1} max={100000} value={people} onChange={(e) => setPeople(Math.max(1, Math.floor(Number(e.target.value) || 0)))} aria-label="People covered" />
      </label>
      <p className="muted plan-fine">
        {status.freeSeats} people are free; each one above that is {usd(status.seatUsd ?? 0)} per period. You have {status.seatsUsed} now. Guests never count.
      </p>

      {problem && <p className="plan-callout warn">{problem}</p>}
      {quote && (
        <>
          <PriceRows price={quote} kind={quote.kind} periods={quote.periods} seats={quote.seats} periodDays={periodDays} seatUsd={quote.seatUsd} />
          <ul className="token-quotes">
            {quote.tokens.map((t) => (
              <li key={t.symbol}>
                <span className="mono">
                  {formatUnits(t.minimum, t.decimals, 4)} {t.symbol}
                </span>
                <span className="muted">{t.rateSource === 'face' ? 'at face value' : `${quote.noxPercent}% off, ${usd(t.usd)} at ${usd(Number(BigInt(t.rate) / 10n ** 12n))} per ${t.symbol}`}</span>
              </li>
            ))}
          </ul>
          {quote.tokens.length < (status.tokens?.length ?? 0) && <p className="muted plan-fine">NOX can’t be priced right now, so this invoice can be paid in USDC only.</p>}
          {quote.zsp && <p className="plan-callout">An admin holds a Zero-State Pass, so this workspace already has Nil Pro. Pay only if you want paid time on top.</p>}
          <div className="settings-row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
              {busy && <Spinner size={14} />} Make the invoice
            </button>
            <span className="muted plan-fine">The NOX rate and discounts are locked for {status.invoiceHours ?? 24} hours. The exact amount gets a few extra digits at the end that identify your payment.</span>
          </div>
        </>
      )}
    </div>
  );
}
