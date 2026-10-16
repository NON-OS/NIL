import { Ban, CheckCircle2, Clock, ExternalLink, EyeOff, Megaphone, TriangleAlert, XCircle } from 'lucide-react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import bounties from '../../actions/bounties';
import tokenAmount from '../../lib/tokenAmount';
import dates from '../../lib/dates';
import shortAddress from '../../lib/shortAddress';
import type Payment from '../../types/Payment';
import isAdminUser from '../../lib/isAdmin';

const ICON = { sent: Clock, confirming: Clock, paid: CheckCircle2, overpaid: CheckCircle2, underpaid: TriangleAlert, failed: XCircle, cancelled: Ban };
const LABEL = { sent: 'Waiting to be mined', confirming: 'Confirming', paid: 'Confirmed', overpaid: 'Confirmed, overpaid', underpaid: 'Confirmed, short', failed: 'Not accepted', cancelled: 'Cancelled' };
const TONE = { sent: 'pending', confirming: 'pending', paid: 'confirmed', overpaid: 'confirmed', underpaid: 'failed', failed: 'failed', cancelled: 'pending' };

export default function PaymentList({ payments, onChange }: { payments: Payment[]; onChange: () => void }) {
  const users = useStore((s) => s.users);
  const nox = useStore((s) => s.nox);
  const isAdmin = useStore((s) => isAdminUser(s.me));

  const act = (fn: () => Promise<unknown>) => fn().then(onChange).catch(toast.error);

  return (
    <div className="settings-card bounty-list" style={{ padding: 0 }}>
      {payments.map((p) => {
        const Icon = ICON[p.state];
        return (
          <div key={p.id} className="bounty-item" style={{ cursor: 'default' }}>
            <div style={{ minWidth: 0 }}>
              <div className="bounty-item-title">
                <span className="mono muted">{p.taskRef}</span>
                <span>
                  {tokenAmount(p.amount, p.token, 8)} to {p.payeeId ? users[p.payeeId]?.name ?? 'a former member' : 'a former member'}
                  {p.state === 'underpaid' && p.expected && <span className="muted"> of {tokenAmount(p.expected, p.token, 8)}</span>}
                </span>
                {p.stealth && (
                  <span className="muted" title={p.announced ? 'Paid to a one-time address and announced on-chain' : 'Paid to a one-time address; not announced on-chain yet'}>
                    <EyeOff size={12} style={{ verticalAlign: '-1px' }} /> private{p.announced ? '' : ', unannounced'}
                  </span>
                )}
              </div>
              <div className="bounty-item-sub">
                {dates.ago(p.confirmedAt ?? p.createdAt)} · <span className="mono">{shortAddress(p.to)}</span>
                {p.problem && <> · <span style={{ color: 'var(--danger)' }}>{p.problem}</span></>}
              </div>
            </div>
            <span className={`pay-status ${TONE[p.state]}`}>
              <Icon /> {LABEL[p.state]}
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
              {isAdmin && p.state === 'sent' && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => act(() => bounties.cancel(p.id))} title="Stuck? Cancel it and pay again. If it lands later anyway, it still counts.">
                  Cancel
                </button>
              )}
              {isAdmin && p.stealth && !p.announced && p.status === 'confirmed' && (
                <button type="button" className="btn btn-sm" onClick={() => act(() => bounties.announce(p))} title="Lets the contributor find this payout from the chain alone">
                  <Megaphone /> Announce
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
