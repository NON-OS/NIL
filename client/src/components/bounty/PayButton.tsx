import { useState } from 'react';
import { EyeOff, Wallet } from 'lucide-react';
import useStore from '../../state/useStore';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import bounties from '../../actions/bounties';
import tokenAmount from '../../lib/tokenAmount';
import type Task from '../../types/Task';

const OUTCOME = {
  confirmed: 'Paid and confirmed on-chain. A signed receipt was added to their proof of work.',
  pending: 'Sent. Nil will confirm it on-chain in a minute or two.',
};

export default function PayButton({ task, name, primary = true, onDone }: { task: Task; name: string; primary?: boolean; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const privately = useStore((s) => Boolean(task.assigneeId && s.users[task.assigneeId]?.stealthMeta && s.stealth));

  const pay = async () => {
    setBusy(true);
    try {
      const payment = await bounties.pay(task);
      if (payment.status === 'failed') toast.show(payment.problem ?? 'That payment couldn’t be verified.', { tone: 'error' });
      else toast.show(OUTCOME[payment.status], { tone: 'success' });
      onDone?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={primary ? 'btn btn-primary' : 'btn'} onClick={pay} disabled={busy}>
      {busy ? <Spinner size={14} /> : privately ? <EyeOff /> : <Wallet />} Pay {tokenAmount(task.bounty!, task.bountyToken)} {privately ? 'privately ' : ''}to {name}
    </button>
  );
}
