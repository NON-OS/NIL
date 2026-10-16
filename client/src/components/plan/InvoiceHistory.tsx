import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import InvoiceStateBadge from './InvoiceStateBadge';
import InvoicePayments from './InvoicePayments';
import toast from '../../state/toast';
import plan from '../../actions/plan';
import dates from '../../lib/dates';
import usd from '../../lib/usd';
import type Invoice from '../../types/Invoice';

// Every invoice so far, newest first, with its transactions. One that expired or was
// cancelled can be made again at today's price, with what it received taken off as credit.
export default function InvoiceHistory({ invoices, onChange }: { invoices: Invoice[]; onChange: (invoice: Invoice) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const retry = async (id: string) => {
    setBusy(id);
    try {
      onChange(await plan.retry(id));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="settings-card bounty-list" style={{ padding: 0 }}>
      {invoices.map((inv) => (
        <div key={inv.id} className="invoice-row">
          <div className="invoice-row-head">
            <span>
              <strong>Invoice {inv.number}</strong>
              <span className="muted"> · {inv.kind === 'seats' ? `${inv.seats} more seats` : `${inv.periods} ${inv.periods === 1 ? 'period' : 'periods'}, ${inv.people} people`} · {usd(inv.price.totalUsd)}</span>
            </span>
            <InvoiceStateBadge state={inv.state} />
            <span className="muted">{dates.ago(inv.paidAt ?? inv.closedAt ?? inv.createdAt)}</span>
            {(inv.status === 'expired' || inv.status === 'cancelled') && (
              <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => retry(inv.id)}>
                <RotateCcw /> Make again
              </button>
            )}
          </div>
          <InvoicePayments payments={inv.payments} decimals={Object.fromEntries(inv.amounts.map((a) => [a.symbol, a.decimals]))} />
        </div>
      ))}
    </div>
  );
}
