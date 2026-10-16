import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Spinner from '../ui/Spinner';
import JoinVote from './JoinVote';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import privateKeys from '../../state/privateKeys';
import anonymousVotes from '../../actions/anonymousVotes';
import dates from '../../lib/dates';
import type Proposal from '../../types/Proposal';

// Voting buttons for an anonymous vote. The proof is made here; the server only ever sees a
// valid ballot from "someone in the group". Which option you chose is remembered in this tab only.
export default function AnonymousBallot({ proposal, open, onChange }: { proposal: Proposal; open: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [mine, setMine] = useState<{ voted: boolean; choice?: number }>({ voted: false });
  const key = useStore((s) => s.me?.semaphoreCommitment ?? null);
  const voters = proposal.anonymous!.members.filter((m) => !m.removed).length;

  // with keys already unlocked this session, tell the member whether a ballot is theirs
  useEffect(() => {
    if (privateKeys.get()) anonymousVotes.mine(proposal).then((voted) => setMine((m) => ({ ...m, voted }))).catch(() => {});
  }, [proposal]);

  const cast = async (choice: number) => {
    setBusy(choice);
    try {
      const countsAt = await anonymousVotes.cast(proposal, choice);
      setMine({ voted: true, choice });
      toast.show(`Ballot proven. It joins the count at ${dates.time(countsAt)} with the others from this hour, so its timing can’t point to you.`, { tone: 'success' });
      onChange();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {open && !key && <JoinVote onJoined={onChange} />}
      {open && anonymousVotes.joined(proposal, key) && (
        <div className="proposal-options" role="group" aria-label="Your anonymous vote">
          {proposal.options.map((option, i) => (
            <button key={option} type="button" className="btn" aria-pressed={mine.choice === i} disabled={busy !== null} onClick={() => cast(i)}>
              {busy === i && <Spinner size={13} />} {busy === i ? 'Proving…' : option}
            </button>
          ))}
        </div>
      )}
      <p className="muted proposal-anon">
        <ShieldCheck size={13} /> Anonymous: {voters} member{voters === 1 ? '' : 's'} can vote.
        {voters < 3 && ' With fewer than three voters, a ballot is easy to guess.'}
        {mine.voted && ` You voted${mine.choice !== undefined ? ` ${proposal.options[mine.choice]}` : ''}; only you can tell.`}
        {open && ' Ballots are counted once an hour, all together.'}
      </p>
    </>
  );
}
