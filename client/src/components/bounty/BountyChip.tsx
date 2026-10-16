import './Bounty.css';
import { Coins } from 'lucide-react';
import useStore from '../../state/useStore';
import tokenAmount from '../../lib/tokenAmount';
import cx from '../../lib/cx';
import type Task from '../../types/Task';

export default function BountyChip({ task }: { task: Task }) {
  useStore((s) => s.rewards);
  if (!task.bounty) return null;
  const amount = tokenAmount(task.bounty, task.bountyToken, 2);
  return (
    <span className={cx('bounty-chip', task.bountyState === 'paid' && 'paid')} title={task.bountyState === 'paid' ? `Bounty paid: ${amount}` : `Bounty: ${amount}`}>
      <Coins />
      {amount}
    </span>
  );
}
