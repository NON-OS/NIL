import { useEffect, useState } from 'react';
import { KeyRound, LockKeyhole } from 'lucide-react';
import Spinner from '../ui/Spinner';
import JoinVote from './JoinVote';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import privateKeys from '../../state/privateKeys';
import anonymousVotes from '../../actions/anonymousVotes';
import encryptedVotes from '../../actions/encryptedVotes';
import dates from '../../lib/dates';
import type Proposal from '../../types/Proposal';

// An anonymous vote weighted by voting power. Ballots are encrypted in the browser with a key
// three trustees hold together; only the summed totals are ever decrypted, by any two of them.
export default function EncryptedBallot({ proposal, open, onChange }: { proposal: Proposal; open: boolean; onChange: () => void }) {
  const users = useStore((s) => s.users);
  const key = useStore((s) => s.me?.semaphoreCommitment ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mine, setMine] = useState<{ voted: boolean; choice?: number }>({ voted: false });
  const enc = proposal.encrypted!;
  const seat = encryptedVotes.seatOf(proposal);
  const dealt = enc.trustees.filter((t) => t.dealt).length;
  const decrypted = enc.trustees.filter((t) => t.decrypted).length;
  const voters = enc.eligible;
  const trusteeNames = enc.trustees.map((t) => (t.userId ? users[t.userId]?.name ?? 'A former member' : 'A former member')).join(', ');

  useEffect(() => {
    if (privateKeys.get()) anonymousVotes.mine(proposal).then((voted) => setMine((m) => ({ ...m, voted }))).catch(() => {});
  }, [proposal]);

  const run = async <T,>(action: string, fn: () => Promise<T>, done: string | ((result: T) => string), after?: () => void) => {
    setBusy(action);
    try {
      const result = await fn();
      after?.();
      toast.show(typeof done === 'function' ? done(result) : done, { tone: 'success' });
      onChange();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  if (!enc.publicKey) {
    const myTurn = seat !== null && !enc.trustees.find((t) => t.position === seat)?.dealt;
    return (
      <p className="muted proposal-anon">
        <KeyRound size={13} /> Waiting for trustees to set up the vote key: {dealt} of 3 ready ({trusteeNames}).
        {myTurn && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => run('deal', () => encryptedVotes.deal(proposal), 'Your trustee share is set up.')}>
            {busy === 'deal' && <Spinner size={13} />} Set up my trustee share
          </button>
        )}
      </p>
    );
  }

  const canDecrypt = !open && !proposal.totals && seat !== null && !enc.trustees.find((t) => t.position === seat)?.decrypted;
  return (
    <>
      {open && !key && <JoinVote onJoined={onChange} />}
      {open && key && !anonymousVotes.joined(proposal, key) && <p className="muted proposal-anon">You had no voting power when this vote opened, so you have no seat in it.</p>}
      {open && anonymousVotes.joined(proposal, key) && (
        <div className="proposal-options" role="group" aria-label="Your encrypted vote">
          {proposal.options.map((option, i) => (
            <button key={option} type="button" className="btn" aria-pressed={mine.choice === i} disabled={busy !== null} onClick={() => run(`vote-${i}`, () => encryptedVotes.cast(proposal, i), (countsAt) => `Ballot encrypted and proven. It joins the count at ${dates.time(countsAt)} with the others from this hour. Nobody can tell it was yours or how much weight it carried.`, () => setMine({ voted: true, choice: i }))}>
              {busy === `vote-${i}` && <Spinner size={13} />} {busy === `vote-${i}` ? 'Encrypting and proving…' : option}
            </button>
          ))}
        </div>
      )}
      <p className="muted proposal-anon">
        <LockKeyhole size={13} />
        {open && `Encrypted and weighted: ${voters} member${voters === 1 ? '' : 's'} had voting power when it opened and can vote with it. Totals stay sealed until two of ${trusteeNames} decrypt them after it closes.`}
        {!open && !proposal.totals && `Closed. Waiting for two of ${trusteeNames} to decrypt the totals. Decrypting: ${decrypted} of 2 trustees done.`}
        {proposal.totals && `Encrypted and weighted. Two of ${trusteeNames} decrypted the totals, with proofs anyone can check in the audit file.`}
        {mine.voted && ` You voted${mine.choice !== undefined ? ` ${proposal.options[mine.choice]}` : ''}; only you can tell.`}
        {canDecrypt && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => run('decrypt', () => encryptedVotes.decrypt(proposal), 'Your part of the decryption is in, with its proof.')}>
            {busy === 'decrypt' && <Spinner size={13} />} Decrypt the totals
          </button>
        )}
      </p>
    </>
  );
}
