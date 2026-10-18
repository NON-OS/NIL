import './Pool.css';
import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import poolAccount from '../../actions/poolAccount';
import poolPayout, { type PreparedPayout } from '../../actions/poolPayout';
import tokenAmount from '../../lib/tokenAmount';
import type Task from '../../types/Task';

const OUTCOME: Record<string, string> = {
  paid: 'Paid from the pool and confirmed on-chain.',
  confirming: 'Sent by the relayer. It counts once its block is final, usually within 15 minutes.',
  sent: 'Handed to the relayer. Nil confirms it once it’s mined and final.',
};
const RECOVERED = 'The relayer reported a problem, but the payout went through. Nil found it on-chain and is checking it.';

// Pays one bounty from the team's pool. Nothing is proven or sent until the admin has seen what
// it costs: the bounty, the relayer's fee on top, and the total that leaves the pool.
export default function PoolPayModal({ task, name, onClose, onDone }: { task: Task; name: string; onClose: () => void; onDone: () => void }) {
  const [prepared, setPrepared] = useState<PreparedPayout | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      // the notes fresh from the server, in case another admin paid from the same deposit
      const opened = await poolAccount.open();
      if (opened.state !== 'open') throw new Error('Open the team’s pool on the Bounties page first.');
      const p = await poolPayout.prepare(task);
      if (live) setPrepared(p);
    })().catch((err) => live && setProblem(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [task]);

  const send = async () => {
    if (!prepared) return;
    setStep('Starting');
    try {
      const { payment, recovered } = await poolPayout.send(prepared, setStep);
      const failed = payment.status === 'failed';
      toast.show(failed ? payment.problem ?? 'That payout couldn’t be verified.' : recovered ? RECOVERED : OUTCOME[payment.state] ?? 'Recorded.', { tone: failed ? 'error' : 'success', timeout: 9000 });
      onDone();
      onClose();
    } catch (err) {
      toast.error(err);
      setStep(null);
    }
  };

  const symbol = prepared?.intent.token ?? task.bountyToken;
  return (
    <Modal title={`Pay ${name} from the team pool`} onClose={step ? () => {} : onClose} width={520}>
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        {problem && <div className="plan-notice" style={{ margin: 0 }}>{problem}</div>}
        {!problem && !prepared && (
          <p className="muted" style={{ margin: 0 }}>
            <Spinner size={14} /> Getting the relayer’s price…
          </p>
        )}
        {prepared && (
          <>
            <dl className="pool-terms">
              <dt>{name} receives, at a new one-time address</dt>
              <dd>{tokenAmount(prepared.intent.amount, symbol, 8)}</dd>
              <dt>Relayer fee ({Number(prepared.quote.feeBps) / 100}%{prepared.quote.extraGas ? ', with a little ETH for the contributor’s gas' : ''})</dt>
              <dd>{tokenAmount(prepared.quote.fee, symbol, 8)}</dd>
              <dt className="pool-total">Leaves the pool</dt>
              <dd className="pool-total">{tokenAmount(prepared.quote.gross, symbol, 8)}</dd>
            </dl>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              Your browser proves the withdrawal (this takes a little while), and the relayer sends it, so no team wallet signs anything. The relayer sees the one-time address and the amount, and Nil’s server, not your browser, talks to it. Nobody watching the chain can tell which deposit paid it.
            </p>
          </>
        )}
        <div className="pool-row end">
          <button type="button" className="btn" onClick={onClose} disabled={Boolean(step)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={send} disabled={!prepared || Boolean(step)}>
            {step && <Spinner size={14} />} {step ?? `Pay ${prepared ? tokenAmount(prepared.quote.gross, symbol, 4) : ''} from the pool`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
