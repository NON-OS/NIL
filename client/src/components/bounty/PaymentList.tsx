import { CheckCircle2, Clock, ExternalLink, XCircle } from 'lucide-react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import bounties from '../../actions/bounties';
import tokenAmount from '../../lib/tokenAmount';
import dates from '../../lib/dates';
import shortAddress from '../../lib/shortAddress';
import type Payment from '../../types/Payment';
import isAdminUser from '../../lib/isAdmin';

const ICON = { confirmed: CheckCircle2, pending: Clock, failed: XCircle };
const LABEL = { confirmed: 'Confirmed', pending: 'Confirming', failed: 'Not accepted' };

export default function PaymentList({ payments, onChange }: { payments: Payment[]; onChange: () => void }) {
  const users = useStore((s) => s.users);
  const nox = useStore((s) => s.nox);
  const isAdmin = useStore((s) => isAdminUser(s.me));

  const act = (fn: () => Promise<unknown>) => fn().then(onChange).catch(toast.error);

  return (
    <div className="settings-card bounty-list" style={{ padding: 0 }}>
      {payments.map((p) => {
        const Icon = ICON[p.status];
        return (
          <div key={p.id} className="bounty-item" style={{ cursor: 'default' }}>
            <div style={{ minWidth: 0 }}>
              <div className="bounty-item-title">
                <span className="mono muted">{p.taskRef}</span>
                <span>
                  {tokenAmount(p.amount, p.token)} to {p.payeeId ? users[p.payeeId]?.name ?? 'a former member' : 'a former member'}
                </span>
              </div>
              <div className="bounty-item-sub">
                {dates.ago(p.confirmedAt ?? p.createdAt)} · <span className="mono">{shortAddress(p.to)}</span>
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
              {isAdmin && p.status === 'pending' && (
                <button type="button" className="btn btn-sm" onClick={() => act(() => bounties.check(p.id))}>
                  Check now
                </button>
              )}
              {isAdmin && p.status === 'failed' && (
                <button type="button" className="btn btn-sm" onClick={() => act(() => bounties.dismiss(p.id))}>
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
