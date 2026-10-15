import './Bounty.css';
import { Coins } from 'lucide-react';
import useStore from '../../state/useStore';
import formatUnits from '../../lib/formatUnits';
import cx from '../../lib/cx';
import type Task from '../../types/Task';

export default function BountyChip({ task }: { task: Task }) {
  const nox = useStore((s) => s.nox);
  if (!task.bounty) return null;
  const amount = `${formatUnits(task.bounty, nox?.decimals ?? 18, 2)} ${nox?.symbol ?? 'NOX'}`;
  return (
    <span className={cx('bounty-chip', task.bountyState === 'paid' && 'paid')} title={task.bountyState === 'paid' ? `Bounty paid: ${amount}` : `Bounty: ${amount}`}>
      <Coins />
      {amount}
    </span>
  );
}
