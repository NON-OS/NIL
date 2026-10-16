import '../bounty/Bounty.css';
import '../plan/Plan.css';
import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import StatTile from '../charts/StatTile';
import PlanBadge from '../plan/PlanBadge';
import PlanPerks from '../plan/PlanPerks';
import InvoiceForm from '../plan/InvoiceForm';
import InvoiceCard from '../plan/InvoiceCard';
import InvoiceHistory from '../plan/InvoiceHistory';
import RevenueCard from '../plan/RevenueCard';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import plan from '../../actions/plan';
import planSummary from '../../lib/planSummary';
import usd from '../../lib/usd';
import isAdminUser from '../../lib/isAdmin';
import type Invoice from '../../types/Invoice';

export default function PlanSettings() {
  const status = useStore((s) => s.plan);
  const nox = useStore((s) => s.nox);
  const rewards = useStore((s) => s.rewards);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [credit, setCredit] = useState(0);
  const [making, setMaking] = useState(false);
  const canPay = Boolean(isAdmin && status.enforced && nox);

  const refresh = useCallback(() => {
    if (!canPay) return;
    plan
      .invoices()
      .then((r) => {
        setInvoices(r.invoices);
        setCredit(r.credit);
      })
      .catch(toast.error);
  }, [canPay]);
  // a payment that settles changes the plan everywhere; the invoices follow
  useEffect(refresh, [refresh, status.activeUntil, status.source]);

  const update = useCallback((invoice: Invoice) => {
    setInvoices((list) => [invoice, ...list.filter((i) => i.id !== invoice.id)].sort((a, b) => b.number - a.number));
    setMaking(false);
    if (invoice.status !== 'open') refresh();
  }, [refresh]);

  const open = invoices.find((i) => i.status === 'open') ?? null;
  const free = status.freeSeats ?? 0;
  const used = status.seatsUsed ?? 0;
  const paidTools = [
    `Bounties paid in ${rewards.map((r) => r.symbol).join(' or ') || 'tokens'}, and a public bounty board`,
    'Wallet-signed votes and the token-holder door',
    'Claude inside tasks, docs and decks, and the AI connection for your own assistant',
    `Teams bigger than ${free} people (guests never count)`,
  ];

  return (
    <>
      <section className="settings-section">
        <h2>Plan</h2>
        <p>Tasks, projects, goals, encrypted docs, time tracking, reminders, share links and exports are free forever. Nil Pro unlocks the tools below for the whole workspace.</p>
        <div className="settings-card">
          <div className="plan-head">
            <PlanBadge />
          </div>
          <p style={{ margin: 0 }}>{planSummary(status).detail}</p>
          {status.enforced && (
            <div className="plan-facts">
              <StatTile label="Price" value={usd(status.priceUsd ?? 0)} sub={`per ${status.periodDays} days, plus ${usd(status.seatUsd ?? 0)} a seat above ${free}`} />
              <StatTile label="People" value={status.seatLimit === null ? `${used}` : `${used} / ${status.seatLimit}`} sub={status.seatLimit === null ? 'No seat limit right now' : 'Covered right now'} />
              <StatTile label="Grace" value={`${status.graceDays} days`} sub="Before tools pause" />
            </div>
          )}
          <ul className="privacy-list">
            {paidTools.map((t) => (
              <li key={t}>
                <Check /> <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {status.enforced && (
        <section className="settings-section">
          <h2>What {nox?.symbol ?? 'NOX'} holders get</h2>
          <PlanPerks />
        </section>
      )}

      {canPay && open && (
        <section className="settings-section">
          <h2>Pay invoice {open.number}</h2>
          <InvoiceCard key={open.id} invoice={open} onChange={update} />
        </section>
      )}

      {canPay && (!open || making) && (
        <section className="settings-section">
          <h2>{status.active ? 'Add time or seats' : 'Get Nil Pro'}</h2>
          <p>Pay in USDC, or in {nox?.symbol ?? 'NOX'} for less, from any wallet or exchange. No card, no email, nothing renews by itself.{credit > 0 && ` You have ${usd(credit)} of credit, which comes off the next invoice.`}</p>
          <InvoiceForm onCreated={update} />
        </section>
      )}
      {canPay && open && !making && (
        <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start', marginBottom: 28 }} onClick={() => setMaking(true)}>
          Make a different invoice
        </button>
      )}

      {canPay && invoices.length > 0 && (
        <section className="settings-section">
          <h2>Invoices</h2>
          <InvoiceHistory invoices={invoices} onChange={update} />
        </section>
      )}

      {canPay && (
        <section className="settings-section">
          <h2>Where the money goes</h2>
          <RevenueCard refreshKey={invoices.filter((i) => i.status === 'paid').length} />
        </section>
      )}
    </>
  );
}
