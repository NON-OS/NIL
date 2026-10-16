import './Bounty.css';
import { useEffect, useState } from 'react';
import Picker from '../ui/Picker';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import taskActions from '../../actions/tasks';
import formatUnits from '../../lib/formatUnits';
import parseUnits from '../../lib/parseUnits';
import tokenAmount from '../../lib/tokenAmount';
import type Task from '../../types/Task';
import isAdminUser from '../../lib/isAdmin';

// Admins type a plain amount like "250" or "12.5" and pick the token (NOX, USDC…); it's stored
// in that token's smallest unit.
export default function BountyField({ task }: { task: Task }) {
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const rewards = useStore((s) => s.rewards);
  const [symbol, setSymbol] = useState(task.bountyToken ?? rewards[0]?.symbol ?? 'NOX');
  const token = rewards.find((t) => t.symbol === symbol);
  const decimals = token?.decimals ?? 18;
  const shown = task.bounty ? formatUnits(task.bounty, decimals, decimals) : '';
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  useEffect(() => setSymbol(task.bountyToken ?? rewards[0]?.symbol ?? 'NOX'), [task.bountyToken, rewards]);

  if (!isAdmin || task.bountyState || !rewards.length) {
    return task.bounty ? <span className="prop-static num">{tokenAmount(task.bounty, task.bountyToken)}</span> : <span className="prop-static placeholder-text">No bounty</span>;
  }

  const save = (nextText = text, nextSymbol = symbol) => {
    const nextDecimals = rewards.find((t) => t.symbol === nextSymbol)?.decimals ?? 18;
    if (nextText.trim() === shown && nextSymbol === task.bountyToken) return;
    if (!nextText.trim()) return task.bounty && taskActions.update(task.id, { bounty: null });
    const bounty = parseUnits(nextText, nextDecimals);
    if (!bounty) {
      toast.show(`Enter an amount like 250 or 12.5 ${nextSymbol}.`, { tone: 'error' });
      setText(shown);
      return;
    }
    taskActions.update(task.id, { bounty, bountyToken: nextSymbol });
  };

  return (
    <span className="bounty-input">
      <input className="input" inputMode="decimal" placeholder="No bounty" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={`Bounty in ${symbol}`} />
      <Picker
        title="Paid in"
        options={rewards.map((t) => ({ value: t.symbol, label: t.symbol }))}
        value={symbol}
        onChange={(next) => {
          setSymbol(next);
          if (text.trim()) save(text, next);
        }}
        width={140}
      >
        <span className="mono">{symbol}</span>
      </Picker>
    </span>
  );
}
