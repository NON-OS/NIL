import { ExternalLink } from 'lucide-react';
import useStore from '../../state/useStore';
import formatUnits from '../../lib/formatUnits';
import dates from '../../lib/dates';
import type InvoicePayment from '../../types/InvoicePayment';

const LABEL: Record<InvoicePayment['status'], string> = {
  seen: 'Seen, not mined yet',
  confirming: 'Confirming',
  final: 'Counted',
  failed: 'Not counted',
  dropped: 'Dropped from the chain',
  unmatched: 'Not for this invoice',
};

// The transactions seen for an invoice, each with what happened to it and a link to check it.
export default function InvoicePayments({ payments, decimals }: { payments: InvoicePayment[]; decimals: Record<string, number> }) {
  const nox = useStore((s) => s.nox);
  if (!payments.length) return null;
  return (
    <ul className="invoice-payments">
      {payments.map((p) => (
        <li key={p.id}>
          <span className="mono">{p.amount && p.symbol ? `${formatUnits(p.amount, decimals[p.symbol] ?? 18, 18)} ${p.symbol}` : 'Transaction'}</span>
          <span className={`pay-status ${p.status === 'final' ? 'confirmed' : ['failed', 'unmatched', 'dropped'].includes(p.status) ? 'failed' : 'pending'}`}>
            {LABEL[p.status]}
            {p.status === 'final' && !p.onTime ? ', as credit' : ''}
          </span>
          <span className="muted">{dates.ago(p.finalAt ?? p.createdAt)}</span>
          {nox && (
            <a className="btn btn-sm btn-ghost" href={`${nox.explorer}/tx/${p.txHash}`} target="_blank" rel="noopener noreferrer" title="Opens a block explorer in a new tab">
              <ExternalLink /> Transaction
            </a>
          )}
          {p.problem && <span className="invoice-problem">{p.problem}</span>}
        </li>
      ))}
    </ul>
  );
}
