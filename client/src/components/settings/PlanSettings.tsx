import '../bounty/Bounty.css';
import '../plan/Plan.css';
import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import StatTile from '../charts/StatTile';
import PlanBadge from '../plan/PlanBadge';
import PlanPay from '../plan/PlanPay';
import PlanPayments from '../plan/PlanPayments';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import plan from '../../actions/plan';
import planSummary from '../../lib/planSummary';
import tokenAmount from '../../lib/tokenAmount';
import shortAddress from '../../lib/shortAddress';
import isAdminUser from '../../lib/isAdmin';
import type PlanPayment from '../../types/PlanPayment';

export default function PlanSettings() {
  const status = useStore((s) => s.plan);
  const nox = useStore((s) => s.nox);
  const rewards = useStore((s) => s.rewards);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const [payments, setPayments] = useState<PlanPayment[]>([]);
  const canPay = Boolean(isAdmin && status.enforced && nox);

  const refresh = useCallback(() => {
    if (canPay) plan.payments().then(setPayments).catch(toast.error);
  }, [canPay]);
  useEffect(refresh, [refresh]);

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
        <p>Tasks, projects, goals, encrypted docs, time tracking, reminders, share links and exports are free forever. The plan unlocks the tools below for the whole workspace.</p>
        <div className="settings-card">
          <div className="plan-head">
            <PlanBadge />
            {status.treasury && <span className="muted mono" title={status.treasury}>Treasury {shortAddress(status.treasury)}</span>}
          </div>
          <p style={{ margin: 0 }}>{planSummary(status).detail}</p>
          {status.enforced && (
            <div className="plan-facts">
              <StatTile label="Price" value={status.price ? tokenAmount(status.price, nox?.symbol, 2) : '—'} sub={`per ${status.periodDays} days`} />
              <StatTile label="People" value={`${used} / ${free}`} sub={used > free ? 'Over the free size' : 'Included without a plan'} />
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

      {canPay && (
        <section className="settings-section">
          <h2>Pay for the plan</h2>
          <PlanPay onPaid={refresh} />
        </section>
      )}

      {canPay && payments.length > 0 && (
        <section className="settings-section">
          <h2>Payments</h2>
          <PlanPayments payments={payments} onChange={refresh} />
        </section>
      )}
    </>
  );
}
