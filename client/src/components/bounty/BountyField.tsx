import './Bounty.css';
import { useEffect, useState } from 'react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import taskActions from '../../actions/tasks';
import formatUnits from '../../lib/formatUnits';
import parseUnits from '../../lib/parseUnits';
import type Task from '../../types/Task';

// Admins type a plain amount like "250" or "12.5"; it's stored in the token's smallest unit.
export default function BountyField({ task }: { task: Task }) {
  const isAdmin = useStore((s) => s.me?.role !== 'member');
  const nox = useStore((s) => s.nox);
  const decimals = nox?.decimals ?? 18;
  const symbol = nox?.symbol ?? 'NOX';
  const shown = task.bounty ? formatUnits(task.bounty, decimals, decimals) : '';
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);

  if (!isAdmin || task.bountyState) {
    return task.bounty ? <span className="num">{formatUnits(task.bounty, decimals)} {symbol}</span> : <span className="placeholder-text">No bounty</span>;
  }

  const save = () => {
    if (text.trim() === shown) return;
    const bounty = text.trim() ? parseUnits(text, decimals) : null;
    if (text.trim() && !bounty) {
      toast.show(`Enter an amount like 250 or 12.5 ${symbol}.`, { tone: 'error' });
      setText(shown);
      return;
    }
    taskActions.update(task.id, { bounty });
  };

  return (
    <label className="bounty-input">
      <input className="input" inputMode="decimal" placeholder="No bounty" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={`Bounty in ${symbol}`} />
      <span className="muted">{symbol}</span>
    </label>
  );
}
