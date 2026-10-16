import '../components/bounty/Bounty.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Hand } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import StatTile from '../components/charts/StatTile';
import EmptyState from '../components/ui/EmptyState';
import Avatar from '../components/ui/Avatar';
import StatusIcon from '../components/ui/StatusIcon';
import BountyChip from '../components/bounty/BountyChip';
import PayButton from '../components/bounty/PayButton';
import PaymentList from '../components/bounty/PaymentList';
import TreasuryCard from '../components/bounty/TreasuryCard';
import PlanNotice from '../components/plan/PlanNotice';
import TransferFeeNotice from '../components/bounty/TransferFeeNotice';
import StealthPayouts from '../components/bounty/StealthPayouts';
import useStore from '../state/useStore';
import useTasks from '../hooks/useTasks';
import toast from '../state/toast';
import bounties from '../actions/bounties';
import taskActions from '../actions/tasks';
import detail from '../actions/detail';
import tokenAmount from '../lib/tokenAmount';
import amountsByToken from '../lib/amountsByToken';
import taskKey from '../lib/taskKey';
import type BountyOverview from '../types/BountyOverview';
import type Task from '../types/Task';
import isAdminUser from '../lib/isAdmin';
import HelpLink from '../components/help/HelpLink';

const sum = (tasks: Task[]) => amountsByToken(tasks.map((t) => ({ amount: t.bounty!, token: t.bountyToken })));

export default function BountiesView() {
  const me = useStore((s) => s.me)!;
  const users = useStore((s) => s.users);
  const nox = useStore((s) => s.nox);
  const rewards = useStore((s) => s.rewards);
  const tasks = useTasks();
  const isAdmin = isAdminUser(me);
  const [data, setData] = useState<BountyOverview | null>(null);

  const refresh = useCallback(() => bounties.overview().then(setData).catch(toast.error), []);
  useEffect(() => {
    refresh();
  }, [refresh, tasks]);

  const { open, owed } = useMemo(() => {
    const live = tasks.filter((t) => t.bounty && t.bountyState !== 'paid' && t.status !== 'canceled');
    return { open: live.filter((t) => t.status !== 'done'), owed: live.filter((t) => t.status === 'done') };
  }, [tasks]);
  const paidOut = amountsByToken((data?.people ?? []).filter((p) => p.paid !== '0').map((p) => ({ amount: p.paid, token: p.token })));
  const unclaimed = open.filter((t) => !t.assigneeId).length;
  const listedCount = open.filter((t) => t.listedAt).length;

  const row = (t: Task, action?: React.ReactNode) => {
    const person = t.assigneeId ? users[t.assigneeId] : undefined;
    return (
      <div key={t.id} className="bounty-item" onClick={() => detail.open(t)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && detail.open(t)}>
        <div style={{ minWidth: 0 }}>
          <div className="bounty-item-title">
            <StatusIcon status={t.status} size={14} />
            <span className="mono muted">{taskKey(t)}</span>
            <span>{t.title}</span>
          </div>
          <div className="bounty-item-sub">{person ? person.name : 'Unclaimed'}</div>
        </div>
        <BountyChip task={t} />
        <span onClick={(e) => e.stopPropagation()}>{action}</span>
      </div>
    );
  };

  return (
    <div className="main">
      <ViewHeader
        title="Bounties"
        icon={<Coins size={17} />}
        subtitle={`${rewards.map((r) => r.symbol).join(' or ') || 'NOX'} rewards, paid wallet to wallet`}
        actions={
          <>
            <HelpLink topic="bounties-and-payouts" label="How bounties work" />
            <a className="btn" href="/open" target="_blank" rel="noopener noreferrer">
              Public board{listedCount ? ` · ${listedCount}` : ''}
            </a>
          </>
        }
      />
      <div className="page page-narrow">
        <PlanNotice what="New bounties" />
        <TransferFeeNotice />
        <div className="bounty-kpis">
          <StatTile label="Open bounties" value={sum(open)} sub={`${open.length} task${open.length === 1 ? '' : 's'}`} />
          <StatTile label="Ready to pay" value={sum(owed)} sub={owed.length ? `${owed.length} finished` : 'Nothing owed'} />
          <StatTile label={isAdmin ? 'Paid out' : 'You earned'} value={paidOut} sub="Confirmed on-chain" />
          <StatTile label="Up for grabs" value={unclaimed} sub="Unclaimed bounties" />
        </div>

        {!open.length && !owed.length && !data?.payments.length ? (
          <EmptyState icon={<Coins />} title="No bounties yet">
            {isAdmin ? 'Open any task and type an amount in its Bounty field. Your wallet pays the contributor directly once the work is done.' : 'When an admin puts a bounty on a task, it shows up here. Claim one and get paid straight to your wallet.'}
          </EmptyState>
        ) : null}

        {owed.length > 0 && (
          <section className="settings-section">
            <h2>Ready to pay</h2>
            <p>Finished work with an unpaid bounty. {isAdmin ? 'Paying opens your wallet; Nil confirms the transfer on-chain.' : 'An admin will pay these to the contributor’s wallet.'}</p>
            <div className="settings-card bounty-list" style={{ padding: 0 }}>
              {owed.map((t) => {
                const person = t.assigneeId ? users[t.assigneeId] : undefined;
                const payable = isAdmin && nox && person?.address && (!t.bountyState || t.bountyState === 'underpaid');
                return row(t, payable ? <PayButton task={t} name={person!.name} onDone={refresh} /> : t.bountyState === 'pending' ? <span className="pay-status pending">Confirming</span> : null);
              })}
            </div>
          </section>
        )}

        {open.length > 0 && (
          <section className="settings-section">
            <h2>Open bounties</h2>
            <p>Unclaimed ones are up for grabs. Take one and it’s yours to deliver.</p>
            <div className="settings-card bounty-list" style={{ padding: 0 }}>
              {open.map((t) =>
                row(
                  t,
                  !t.assigneeId && (
                    <button type="button" className="btn btn-sm" onClick={() => taskActions.update(t.id, { assigneeId: me.id })}>
                      <Hand /> Take it
                    </button>
                  ),
                ),
              )}
            </div>
          </section>
        )}

        {data && data.people.length > 0 && (
          <section className="settings-section">
            <h2>{isAdmin ? 'Per person' : 'Your earnings'}</h2>
            <div className="settings-card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="bounty-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Promised</th>
                    <th>Owed</th>
                    <th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((p) => (
                    <tr key={`${p.userId}-${p.token}`}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Avatar user={users[p.userId]} size={20} />
                          {users[p.userId]?.name ?? 'A former member'}
                        </span>
                      </td>
                      <td>{tokenAmount(p.promised, p.token, 2)}</td>
                      <td>{tokenAmount(p.owed, p.token, 2)}</td>
                      <td>{tokenAmount(p.paid, p.token, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {nox && <StealthPayouts revision={data} />}

        {data && data.payments.length > 0 && (
          <section className="settings-section">
            <h2>Payments</h2>
            <p>Every transfer Nil checked on-chain. {isAdmin ? 'Only admins and the person paid can see these, because a transaction reveals the receiving wallet.' : 'Only you and the admins can see your payments.'}</p>
            <PaymentList payments={data.payments} onChange={refresh} />
          </section>
        )}

        {isAdmin && data && nox && (
          <section className="settings-section">
            <h2>Treasury addresses</h2>
            <p>Bounties can be paid from any admin’s own wallet. Add a team treasury here, like a Safe multisig, so payments from it are accepted too. Paste the transaction in the task when you pay from it.</p>
            <TreasuryCard addresses={data.treasury} onChange={(treasury) => setData({ ...data, treasury })} />
          </section>
        )}
      </div>
    </div>
  );
}
