import { useEffect, useRef, useState } from 'react';
import { KeyRound, LockKeyhole, ShieldAlert } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import privateKeys from '../../state/privateKeys';
import anonymousVotes from '../../actions/anonymousVotes';
import encryptedVotes from '../../actions/encryptedVotes';
import vault from '../../actions/vault';
import JoinVote from './JoinVote';
import dates from '../../lib/dates';
import type Proposal from '../../types/Proposal';

// An anonymous vote weighted by voting power. Ballots are encrypted in the browser with a key
// three trustees hold together; only the summed totals are ever decrypted, by any two of them.
export default function EncryptedBallot({ proposal, open, onChange }: { proposal: Proposal; open: boolean; onChange: () => void }) {
  const users = useStore((s) => s.users);
  const unlocked = useStore((s) => s.docsUnlocked);
  const key = useStore((s) => s.me?.semaphoreCommitment ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mine, setMine] = useState<{ voted: boolean; choice?: number }>({ voted: false });
  const tried = useRef(new Set<string>());
  const enc = proposal.encrypted!;
  const seat = encryptedVotes.seatOf(proposal);
  const step = encryptedVotes.nextStep(proposal);
  const committed = enc.trustees.filter((t) => t.committed).length;
  const dealt = enc.trustees.filter((t) => t.dealt).length;
  const checked = enc.trustees.filter((t) => t.shares === 'ok').length;
  const decrypted = enc.trustees.filter((t) => t.decrypted).length;
  const voters = enc.eligible;
  const trusteeNames = enc.trustees.map((t) => (t.userId ? users[t.userId]?.name ?? 'A former member' : 'A former member')).join(', ');

  useEffect(() => {
    if (privateKeys.get()) anonymousVotes.mine(proposal).then((voted) => setMine((m) => ({ ...m, voted }))).catch(() => {});
  }, [proposal]);

  const run = async <T,>(action: string, fn: () => Promise<T>, done: string | null | ((result: T) => string), after?: () => void) => {
    setBusy(action);
    try {
      const result = await fn();
      after?.();
      if (done) toast.show(typeof done === 'function' ? done(result) : done, { tone: 'success' });
      onChange();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const reveal = () => run('reveal', () => encryptedVotes.reveal(proposal), 'Your trustee share is set up.');
  const checkShares = () => run('check', () => encryptedVotes.checkShares(proposal), null);

  // Revealing and checking shares need no decision, so a tab whose keys are unlocked does them as
  // soon as they're due, once per vote and step.
  useEffect(() => {
    if ((step !== 'reveal' && step !== 'check') || !unlocked || busy !== null || tried.current.has(`${proposal.id}:${step}`)) return;
    tried.current.add(`${proposal.id}:${step}`);
    void (step === 'reveal' ? reveal() : checkShares());
  }, [step, unlocked, busy, proposal.id]);

  if (!enc.publicKey) {
    return (
      <p className="muted proposal-anon">
        <KeyRound size={13} />
        {committed < 3 ? `Waiting for trustees to commit to the vote key: ${committed} of 3 ready (${trusteeNames}).` : `Trustees are revealing their key shares: ${dealt} of 3 done (${trusteeNames}).`}
        {step === 'commit' && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => run('commit', () => encryptedVotes.commit(proposal), 'Your trustee share is committed. It finishes once all three trustees have committed.')}>
            {busy === 'commit' && <Spinner size={13} />} Set up my trustee share
          </button>
        )}
        {step === 'reveal' && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={reveal}>
            {busy === 'reveal' && <Spinner size={13} />} Finish my trustee share
          </button>
        )}
      </p>
    );
  }

  if (enc.disputed) {
    return (
      <p className="muted proposal-anon" role="alert">
        <ShieldAlert size={13} /> A trustee found a key share that doesn’t match what its dealer committed to, so this vote can’t take ballots. An admin should start it again.
      </p>
    );
  }

  const canDecrypt = !open && !proposal.totals && seat !== null && !enc.trustees.find((t) => t.position === seat)?.decrypted;
  return (
    <>
      {open && !key && <JoinVote onJoined={onChange} />}
      {open && key && !anonymousVotes.joined(proposal.anonymous?.members, key) && <p className="muted proposal-anon">You had no voting power when this vote opened, so you have no seat in it.</p>}
      {open && anonymousVotes.joined(proposal.anonymous?.members, key) && (
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
        {open && `Encrypted and weighted: ${voters} member${voters === 1 ? '' : 's'} had voting power when it opened and can vote with it. Totals stay sealed until two of ${trusteeNames} decrypt them after it closes. Key shares checked by ${checked} of 3 trustees.`}
        {!open && !proposal.totals && `Closed. Waiting for two of ${trusteeNames} to decrypt the totals. Decrypting: ${decrypted} of 2 trustees done.`}
        {proposal.totals && `Encrypted and weighted. Two of ${trusteeNames} decrypted the totals, with proofs anyone can check in the audit file.`}
        {mine.voted && ` You voted${mine.choice !== undefined ? ` ${proposal.options[mine.choice]}` : ''}; only you can tell.`}
        {step === 'check' && !unlocked && (
          <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => vault.unlock().catch(toast.error)}>
            {busy === 'check' && <Spinner size={13} />} Check my key shares
          </button>
        )}
        {canDecrypt && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => run('decrypt', () => encryptedVotes.decrypt(proposal), 'Your part of the decryption is in, with its proof.')}>
            {busy === 'decrypt' && <Spinner size={13} />} Decrypt the totals
          </button>
        )}
      </p>
    </>
  );
}
