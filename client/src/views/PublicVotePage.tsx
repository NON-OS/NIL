import '../components/votes/Votes.css';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Coins, Download, EyeOff, Globe, Lock } from 'lucide-react';
import NilLogo from '../components/brand/NilLogo';
import Meter from '../components/charts/Meter';
import Spinner from '../components/ui/Spinner';
import PublicBallotTable from '../components/votes/PublicBallotTable';
import PublicVoteFacts from '../components/votes/PublicVoteFacts';
import publicVotes from '../actions/publicVotes';
import router from '../lib/router';
import dates from '../lib/dates';
import timeLeft from '../lib/timeLeft';
import formatUnits from '../lib/formatUnits';
import type PublicVote from '../types/PublicVote';

// Totals move while a vote is open, so the page looks again now and then.
const REFRESH_MS = 20_000;

const percent = (part: bigint, whole: bigint) => (whole ? Number((part * 1000n) / whole) / 10 : 0);

// A public vote's own page: anyone can watch, and anyone who held NOX when it opened can vote
// with their wallet, without an account. It shows what the server counted and how to check it.
export default function PublicVotePage({ slug }: { slug: string }) {
  const [vote, setVote] = useState<PublicVote | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [counted, setCounted] = useState<{ choice: number; weight: string } | null>(null);

  const load = useCallback(() => publicVotes.get(slug).then(setVote, () => setMissing(true)), [slug]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const cast = async (choice: number) => {
    setBusy(choice);
    setError('');
    try {
      const res = await publicVotes.cast(slug, choice);
      setVote(res.vote);
      setCounted({ choice, weight: res.counted.weight });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your ballot wasn’t counted.');
    } finally {
      setBusy(null);
    }
  };

  const decimals = vote?.snapshot.token.decimals ?? 18;
  const symbol = vote?.snapshot.token.symbol ?? 'NOX';
  const power = (w: string) => `${formatUnits(w, decimals, 2)} power`;
  const totals = vote?.totals?.map((t) => BigInt(t));
  const sum = totals?.reduce((a, b) => a + b, 0n) ?? 0n;

  return (
    <div className="verify-standalone">
      <header>
        <NilLogo height={42} />
        <a className="btn btn-sm" href="/" onClick={router.link('/')}>
          Sign in
        </a>
      </header>
      <main className="page page-narrow public-vote">
        {missing ? (
          <p className="muted">This vote doesn’t exist, or it was deleted.</p>
        ) : !vote ? (
          <Spinner size={20} />
        ) : (
          <>
            <span className="eyebrow">{vote.workspace ? `${vote.workspace} · public vote` : 'Public vote'}</span>
            <h1>{vote.title}</h1>
            <div className="proposal-meta">
              <span>
                <Clock /> {vote.open ? timeLeft(vote.closesAt) : `closed ${dates.ago(vote.closedAt ?? vote.closesAt)}`}
              </span>
              <span>
                <Coins /> weighted by voting power
              </span>
              {vote.sealed && (
                <span>
                  <EyeOff /> sealed until it closes
                </span>
              )}
              <span>
                <Globe /> public
              </span>
            </div>
            {vote.body && <p className="proposal-body">{vote.body}</p>}

            {vote.open && (
              <>
                <p className="proposal-notice" role="note">
                  <Globe aria-hidden="true" /> Anyone who held {symbol}, staked {symbol} or Zero-State Passes at block {vote.snapshot.block}, when this vote opened, can vote with that wallet. Your wallet, your choice and your voting power are shown to everyone. Signing costs nothing and sends no transaction.
                </p>
                <div className="proposal-options" role="group" aria-label="Your vote">
                  {vote.options.map((option, i) => (
                    <button key={option} type="button" className="btn" aria-pressed={counted?.choice === i} disabled={busy !== null} onClick={() => void cast(i)}>
                      {busy === i && <Spinner size={13} />} {option}
                    </button>
                  ))}
                </div>
                {error && (
                  <div className="auth-error" role="alert">
                    {error}
                  </div>
                )}
                {counted && (
                  <p className="pay-status confirmed" role="status">
                    <CheckCircle2 /> Counted: {vote.options[counted.choice]} with {power(counted.weight)}. You can change it until the vote closes.
                  </p>
                )}
              </>
            )}

            {totals ? (
              <div className="proposal-results">
                {vote.options.map((option, i) => (
                  <Meter key={option} label={option} value={percent(totals[i], sum)} total={100} color={i === 0 ? 'var(--accent-line)' : 'var(--chart-2)'} caption={`${power(String(totals[i]))} · ${percent(totals[i], sum)}%`} />
                ))}
              </div>
            ) : (
              <p className="muted public-vote-sealed">
                <Lock size={13} aria-hidden="true" /> Results and ballots stay sealed until the vote closes.
              </p>
            )}

            <div className="proposal-foot">
              <span>
                {vote.voters} voter{vote.voters === 1 ? '' : 's'}
              </span>
              <span className="grow" />
              {(!vote.sealed || vote.closedAt) && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void publicVotes.audit(vote).catch((err) => setError(err.message))}>
                  <Download /> Audit file
                </button>
              )}
            </div>

            {vote.ballots && <PublicBallotTable vote={vote} power={power} />}
            <PublicVoteFacts vote={vote} />
          </>
        )}
      </main>
    </div>
  );
}
