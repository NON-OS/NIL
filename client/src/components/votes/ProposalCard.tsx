import './Votes.css';
import { useState } from 'react';
import { Clock, Coins, Download, EyeOff, Lock, ShieldCheck, Users } from 'lucide-react';
import Meter from '../charts/Meter';
import ConfirmButton from '../ui/ConfirmButton';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import votes from '../../actions/votes';
import dates from '../../lib/dates';
import timeLeft from '../../lib/timeLeft';
import formatUnits from '../../lib/formatUnits';
import cx from '../../lib/cx';
import type Proposal from '../../types/Proposal';
import isAdminUser from '../../lib/isAdmin';
import AnonymousBallot from './AnonymousBallot';
import EncryptedBallot from './EncryptedBallot';

const percent = (part: bigint, whole: bigint) => (whole ? Number((part * 1000n) / whole) / 10 : 0);

export default function ProposalCard({ proposal, onChange }: { proposal: Proposal; onChange: () => void }) {
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const author = useStore((s) => (proposal.createdBy ? s.users[proposal.createdBy] : undefined));
  const decimals = useStore((s) => s.nox?.decimals ?? 18);
  const [busy, setBusy] = useState<number | 'close' | null>(null);
  const open = !proposal.closedAt && proposal.closesAt > Date.now();
  const weight = (w: string) => (proposal.weighting === 'power' ? `${formatUnits(w, decimals, 2)} power` : `${w} vote${w === '1' ? '' : 's'}`);

  const run = async (key: number | 'close', fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.show(done, { tone: 'success' });
      onChange();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const totals = proposal.totals?.map((t) => BigInt(t));
  const sum = totals?.reduce((a, b) => a + b, 0n) ?? 0n;

  return (
    <article className={cx('proposal', !open && 'closed')}>
      <div className="proposal-head">
        <h2>{proposal.title}</h2>
        <div className="proposal-meta">
          <span>
            <Clock /> {open ? timeLeft(proposal.closesAt) : `closed ${dates.ago(proposal.closedAt ?? proposal.closesAt)}`}
          </span>
          <span>{proposal.weighting === 'power' ? <><Coins /> weighted by voting power</> : <><Users /> one person, one vote</>}</span>
          {proposal.sealed && <span><EyeOff /> sealed until it closes</span>}
          {proposal.anonymous && <span><ShieldCheck /> anonymous</span>}
          {author && <span>by {author.name}</span>}
        </div>
      </div>
      {proposal.body && <p className="proposal-body">{proposal.body}</p>}

      {proposal.encrypted ? <EncryptedBallot proposal={proposal} open={open} onChange={onChange} /> : proposal.anonymous && <AnonymousBallot proposal={proposal} open={open} onChange={onChange} />}

      {open && !proposal.anonymous && (
        <div className="proposal-options" role="group" aria-label="Your vote">
          {proposal.options.map((option, i) => (
            <button key={option} type="button" className="btn" aria-pressed={proposal.myVote?.choice === i} disabled={busy !== null} onClick={() => run(i, () => votes.cast(proposal.id, i), 'Vote signed and counted.')}>
              {busy === i && <Spinner size={13} />} {option}
            </button>
          ))}
        </div>
      )}

      {totals ? (
        <div className="proposal-results">
          {proposal.options.map((option, i) => (
            <Meter key={option} label={<>{option}{proposal.myVote?.choice === i && <span className="muted"> · your vote</span>}</>} value={percent(totals[i], sum)} total={100} color={i === 0 ? 'var(--accent-line)' : 'var(--chart-2)'} caption={`${weight(String(totals[i]))} · ${percent(totals[i], sum)}%`} />
          ))}
        </div>
      ) : proposal.encrypted ? null : (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          <Lock size={13} style={{ verticalAlign: '-2px' }} /> Results stay sealed until the vote closes.
        </p>
      )}

      <div className="proposal-foot">
        <span>
          {proposal.voters} voter{proposal.voters === 1 ? '' : 's'}
          {proposal.myVote && ` · you voted ${proposal.options[proposal.myVote.choice]} with ${weight(proposal.myVote.weight)}`}
        </span>
        <span className="grow" />
        {isAdmin && (
          <>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => votes.audit(proposal).catch(toast.error)} title={proposal.anonymous ? 'Every ballot’s proof, so anyone can recount without learning who voted' : 'Every signed ballot, so anyone can recount'}>
              <Download /> Audit file
            </button>
            {open && (
              <ConfirmButton className="btn btn-sm" onConfirm={() => run('close', () => votes.close(proposal.id), 'Vote closed.')} confirmLabel="Close now?">
                {busy === 'close' && <Spinner size={13} />} Close vote
              </ConfirmButton>
            )}
            <ConfirmButton className="btn btn-sm btn-ghost" onConfirm={() => run('close', () => votes.remove(proposal.id))} confirmLabel="Delete?">
              Delete
            </ConfirmButton>
          </>
        )}
      </div>
    </article>
  );
}
