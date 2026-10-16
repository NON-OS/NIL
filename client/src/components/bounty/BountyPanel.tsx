import './Bounty.css';
import { useState } from 'react';
import { CheckCircle2, Coins } from 'lucide-react';
import PayButton from './PayButton';
import PastePayment from './PastePayment';
import Applications from './Applications';
import taskActions from '../../actions/tasks';
import useStore from '../../state/useStore';
import router from '../../lib/router';
import tokenAmount from '../../lib/tokenAmount';
import cx from '../../lib/cx';
import type Task from '../../types/Task';
import isAdminUser from '../../lib/isAdmin';

// The bounty's story inside a task: what it's worth, who gets it, and the way to pay it.
export default function BountyPanel({ task }: { task: Task }) {
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const nox = useStore((s) => s.nox);
  const assignee = useStore((s) => (task.assigneeId ? s.users[task.assigneeId] : undefined));
  const [pasting, setPasting] = useState(false);
  if (!task.bounty) return null;

  const amount = tokenAmount(task.bounty, task.bountyToken);
  const paid = task.bountyState === 'paid';

  let body;
  if (paid) {
    body = <p>Paid to {assignee?.name ?? 'the contributor'} and confirmed on-chain. A signed payment receipt is in their proof of work.</p>;
  } else if (task.bountyState === 'pending') {
    body = <p>The payment was sent. It counts once its block on Ethereum is final, usually within 15 minutes. If it’s stuck, cancel it under Bounties and pay again.</p>;
  } else if (!isAdmin) {
    body = <p>{assignee ? `An admin pays this to ${assignee.name}’s wallet when the work is done.` : 'Unassigned. Take it and an admin pays your wallet when the work is done.'}</p>;
  } else if (!nox) {
    body = <p>On-chain features are turned off on this server, so bounties can’t be paid from here.</p>;
  } else if (!assignee) {
    body = (
      <>
        <p>Assign someone to pay this bounty to their wallet, or list it publicly so anyone can apply with a wallet.</p>
        {!task.private && (
          <label className="filter-toggle">
            <button type="button" className="toggle" role="switch" aria-checked={!!task.listedAt} onClick={() => taskActions.update(task.id, { listed: !task.listedAt })} aria-label="List on the public bounty board" />
            List on the public bounty board
            {task.listedAt && (
              <a href={`/open#${task.id}`} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6 }}>
                View
              </a>
            )}
          </label>
        )}
        {task.listedAt && <Applications taskId={task.id} />}
      </>
    );
  } else if (!assignee.address) {
    body = <p>{assignee.name} has no wallet linked, so there’s nowhere to send it yet.</p>;
  } else {
    body = (
      <>
        <p>
          {task.bountyState === 'underpaid' ? `Part of the bounty reached ${assignee.name}. Pay the rest the same way.` : `Your wallet sends ${amount} straight to ${assignee.name}.`} Nil never holds funds; it gives the exact amount to send, checks the transfer on-chain and signs a receipt.
          {task.status !== 'done' && task.bountyState !== 'underpaid' && ' Most teams pay once the task is done.'}
        </p>
        <div className="bounty-actions">
          <PayButton task={task} name={assignee.name} primary={task.status === 'done'} />
          <button type="button" className="btn btn-ghost" onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>
            Paid another way?
          </button>
        </div>
        {pasting && <PastePayment taskId={task.id} />}
      </>
    );
  }

  return (
    <section className={cx('bounty-panel', paid && 'paid')} aria-label="Bounty">
      <div className="bounty-panel-head">
        {paid ? <CheckCircle2 /> : <Coins />}
        {paid ? `${amount} paid` : task.bountyState === 'pending' ? `${amount} confirming…` : task.bountyState === 'underpaid' ? `${amount} bounty, partly paid` : `${amount} bounty`}
        <span className="grow" style={{ flex: 1 }} />
        <a href="/bounties" className="btn btn-ghost btn-sm" onClick={router.link('/bounties')}>
          All bounties
        </a>
      </div>
      {body}
    </section>
  );
}
