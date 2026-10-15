import { CheckCircle2, Clock, ExternalLink, XCircle } from 'lucide-react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import plan from '../../actions/plan';
import tokenAmount from '../../lib/tokenAmount';
import dates from '../../lib/dates';
import type PlanPayment from '../../types/PlanPayment';

const ICON = { confirmed: CheckCircle2, pending: Clock, failed: XCircle };
const LABEL = { confirmed: 'Confirmed', pending: 'Confirming', failed: 'Not accepted' };

export default function PlanPayments({ payments, onChange }: { payments: PlanPayment[]; onChange: () => void }) {
  const nox = useStore((s) => s.nox);
  const periodDays = useStore((s) => s.plan.periodDays ?? 30);

  return (
    <div className="settings-card bounty-list" style={{ padding: 0 }}>
      {payments.map((p) => {
        const Icon = ICON[p.status];
        return (
          <div key={p.id} className="bounty-item" style={{ cursor: 'default' }}>
            <div style={{ minWidth: 0 }}>
              <div className="bounty-item-title">
                <span>{p.amount ? tokenAmount(p.amount, nox?.symbol) : 'Subscription payment'}</span>
                {p.periods ? <span className="muted">· {p.periods * periodDays} days</span> : null}
              </div>
              <div className="bounty-item-sub">
                {dates.ago(p.confirmedAt ?? p.createdAt)}
                {p.problem && <> · <span style={{ color: 'var(--danger)' }}>{p.problem}</span></>}
              </div>
            </div>
            <span className={`pay-status ${p.status}`}>
              <Icon /> {LABEL[p.status]}
            </span>
            <div className="bounty-actions">
              {nox && (
                <a className="btn btn-sm btn-ghost" href={`${nox.explorer}/tx/${p.txHash}`} target="_blank" rel="noopener noreferrer" title="Opens a block explorer in a new tab">
                  <ExternalLink /> Transaction
                </a>
              )}
              {p.status === 'pending' && (
                <button type="button" className="btn btn-sm" onClick={() => plan.check(p.id).then(onChange).catch(toast.error)}>
                  Check now
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
