import { useState } from 'react';
import { EyeOff, Wallet } from 'lucide-react';
import useStore from '../../state/useStore';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import bounties from '../../actions/bounties';
import tokenAmount from '../../lib/tokenAmount';
import type Task from '../../types/Task';

const OUTCOME: Record<string, string> = {
  paid: 'Paid and confirmed on-chain. A signed receipt was added to their proof of work.',
  overpaid: 'Paid and confirmed on-chain, with more than was asked for.',
  underpaid: 'Part of it arrived. Pay the rest when you’re ready.',
  confirming: 'Sent. It counts once its block is final, usually within 15 minutes.',
  sent: 'Sent. Nil confirms it on-chain once it’s mined and final.',
};

export default function PayButton({ task, name, primary = true, onDone }: { task: Task; name: string; primary?: boolean; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const privately = useStore((s) => Boolean(task.assigneeId && s.users[task.assigneeId]?.stealthMeta && s.stealth));

  const pay = async () => {
    setBusy(true);
    try {
      const payment = await bounties.pay(task);
      if (payment.status === 'failed') toast.show(payment.problem ?? 'That payment couldn’t be verified.', { tone: 'error', timeout: 9000 });
      else toast.show(OUTCOME[payment.state] ?? 'Recorded.', { tone: 'success' });
      onDone?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={primary ? 'btn btn-primary' : 'btn'} onClick={pay} disabled={busy}>
      {busy ? <Spinner size={14} /> : privately ? <EyeOff /> : <Wallet />} {task.bountyState === 'underpaid' ? 'Pay the rest' : `Pay ${tokenAmount(task.bounty!, task.bountyToken)}`} {privately ? 'privately ' : ''}to {name}
    </button>
  );
}
