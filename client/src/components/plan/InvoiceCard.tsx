import { useEffect, useState, type FormEvent } from 'react';
import { Wallet, X } from 'lucide-react';
import Spinner from '../ui/Spinner';
import CopyValue from './CopyValue';
import QrCode from './QrCode';
import InvoiceStateBadge from './InvoiceStateBadge';
import InvoicePayments from './InvoicePayments';
import PriceRows from './PriceRows';
import TokenChoice from './TokenChoice';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import plan from '../../actions/plan';
import ethereum from '../../lib/ethereum';
import formatUnits from '../../lib/formatUnits';
import shortAddress from '../../lib/shortAddress';
import timeLeft from '../../lib/timeLeft';
import usd from '../../lib/usd';
import type Invoice from '../../types/Invoice';

const LIVE = ['waiting', 'seen', 'confirming', 'underpaid'];
const POLL_MS = 8000;

// The open invoice: what to send, where, and how, with its state kept live. Payment can come
// from the browser wallet in one click, or from any other wallet or exchange by link, QR code
// or by copying the exact amount.
export default function InvoiceCard({ invoice, onChange }: { invoice: Invoice; onChange: (invoice: Invoice) => void }) {
  const status = useStore((s) => s.plan);
  const [token, setToken] = useState(invoice.amounts[0]?.token ?? '');
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState<'wallet' | 'hash' | 'cancel' | 'check' | null>(null);
  const amount = invoice.amounts.find((a) => a.token === token) ?? invoice.amounts[0];
  const live = LIVE.includes(invoice.state);
  const decimals = Object.fromEntries(invoice.amounts.map((a) => [a.symbol, a.decimals]));

  // follows the invoice while something can still happen to it, and only while it's on screen
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') plan.get(invoice.id).then(onChange).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [invoice.id, live, onChange]);

  const run = async (kind: 'wallet' | 'hash' | 'cancel' | 'check', fn: () => Promise<Invoice>) => {
    setBusy(kind);
    try {
      onChange(await fn());
      if (kind === 'hash') setHash('');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };
  const paste = (e: FormEvent) => {
    e.preventDefault();
    run('hash', () => plan.name(invoice.id, hash.trim()));
  };
  const inFlight = invoice.payments.some((p) => p.status === 'seen' || p.status === 'confirming');

  return (
    <div className="settings-card invoice">
      <div className="plan-head">
        <InvoiceStateBadge state={invoice.state} />
        <span className="muted">
          Invoice {invoice.number}
          {invoice.status === 'open' && ` · expires in ${timeLeft(invoice.expiresAt).replace(' left', '')}`}
        </span>
      </div>

      <PriceRows price={invoice.price} kind={invoice.kind} periods={invoice.periods} seats={invoice.seats} periodDays={status.periodDays ?? 30} seatUsd={status.seatUsd ?? 0} />
      {invoice.zsp && <p className="plan-fine">An admin holds a Zero-State Pass, so Nil Pro is already included. Paying adds paid time on top.</p>}

      {invoice.state === 'confirming' && <p className="plan-callout">Payment found. It counts once its block is final, usually within 15 minutes on Ethereum.</p>}
      {invoice.state === 'seen' && <p className="plan-callout">Your transaction was sent and isn’t in a block yet. This updates by itself.</p>}

      {invoice.status === 'open' && amount && (
        <>
          {invoice.amounts.length > 1 && <TokenChoice amounts={invoice.amounts} chosen={amount.token} onChoose={setToken} noxPercent={invoice.price.noxPercent} />}
          {invoice.state === 'underpaid' && amount.shortfall && (
            <p className="plan-callout warn">
              {formatUnits(amount.received, amount.decimals, amount.decimals)} {amount.symbol} arrived, {formatUnits(amount.shortfall, amount.decimals, amount.decimals)} {amount.symbol} short. Send the amount below to finish; it ends in the same digits so it’s matched to this invoice.
            </p>
          )}
          <div className="invoice-pay">
            <div className="invoice-pay-text">
              <CopyValue label="Exact amount" value={formatUnits(amount.ask, amount.decimals, amount.decimals).replace(/,/g, '')} shown={`${formatUnits(amount.ask, amount.decimals, amount.decimals)} ${amount.symbol}`} big />
              <CopyValue label={`To ${status.treasuryName ?? 'the treasury'}`} value={status.treasury ?? ''} shown={shortAddress(status.treasury ?? '')} />
              <CopyValue label="Payment link" value={amount.link} shown="ethereum: link for a wallet" />
              <div className="settings-row">
                <button type="button" className="btn btn-primary" disabled={busy !== null || !ethereum.available()} onClick={() => run('wallet', () => plan.payWithWallet(invoice, amount))}>
                  {busy === 'wallet' ? <Spinner size={14} /> : <Wallet />} Pay {amount.symbol} from this browser’s wallet
                </button>
              </div>
              <p className="muted plan-fine">
                Send exactly this amount from any wallet or exchange: the last digits tell your payment apart from everyone else’s. An exchange that rounds the amount can’t be matched, so use one that sends it as is. Nothing renews by itself.
                {!ethereum.available() && ' No wallet in this browser: scan the code with your phone wallet.'}
              </p>
            </div>
            <figure className="invoice-qr">
              <QrCode text={amount.link} label={`Payment link for ${formatUnits(amount.ask, amount.decimals, amount.decimals)} ${amount.symbol}`} />
              <figcaption className="muted">Scan with a phone wallet</figcaption>
            </figure>
          </div>
          <form className="bounty-paste" onSubmit={paste}>
            <input className="input" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Paid from an exchange or a Safe? 0x… transaction hash" aria-label="Transaction hash" spellCheck={false} autoComplete="off" />
            <button type="submit" className="btn" disabled={busy !== null || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())}>
              {busy === 'hash' && <Spinner size={14} />} Find payment
            </button>
          </form>
        </>
      )}

      {invoice.state === 'overpaid' && <p className="plan-callout">{usd(invoice.overpaidUsd)} more arrived than was due. It was added as extra time: {invoice.grantedDays} days in all.</p>}
      {(invoice.state === 'paid' || invoice.state === 'overpaid') && <p className="plan-fine">Counted. Nil Pro now runs until the date at the top of this page.</p>}

      <InvoicePayments payments={invoice.payments} decimals={decimals} />

      {invoice.status === 'open' && (
        <div className="settings-row">
          <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => run('check', () => plan.check(invoice.id))} title="Looks at the chain now instead of at the next check, which runs every minute">
            {busy === 'check' && <Spinner size={14} />} Check now
          </button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null || inFlight} onClick={() => run('cancel', () => plan.cancel(invoice.id))} title={inFlight ? 'A payment is on its way; wait until it settles.' : undefined}>
            {busy === 'cancel' ? <Spinner size={14} /> : <X />} Cancel invoice
          </button>
          <span className="muted plan-fine">Anything already paid toward it stays as credit.</span>
        </div>
      )}
    </div>
  );
}
