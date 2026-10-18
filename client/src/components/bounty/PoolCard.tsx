import './Pool.css';
import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, KeyRound, RefreshCw, Undo2 } from 'lucide-react';
import PoolDepositModal from './PoolDepositModal';
import ConfirmButton from '../ui/ConfirmButton';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import poolAccount, { type PoolState } from '../../actions/poolAccount';
import poolReview, { type Review } from '../../actions/poolReview';
import poolRagequit from '../../actions/poolRagequit';
import poolRebuild from '../../actions/poolRebuild';
import noteBook from '../../lib/pools/noteBook';
import tokenAmount from '../../lib/tokenAmount';
import dates from '../../lib/dates';
import type PoolInfo from '../../types/PoolInfo';
import type PoolNote from '../../types/PoolNote';

const REVIEW: Record<Review, { label: string; tone: string }> = {
  approved: { label: 'Approved', tone: 'confirmed' },
  pending: { label: 'Waiting for review', tone: 'pending' },
  poi_required: { label: 'Needs proof of innocence', tone: 'pending' },
  declined: { label: 'Declined', tone: 'declined' },
  exited: { label: 'Taken back', tone: '' },
  spent: { label: 'Spent', tone: '' },
  unknown: { label: 'Not approved yet', tone: 'pending' },
};

function status(n: PoolNote, reviews: Map<string, Review>) {
  if (n.state === 'sending') return { label: n.txHash ? 'Being mined' : 'Not sent', tone: 'pending' };
  if (n.state === 'failed') return { label: 'Failed', tone: 'failed' };
  if (n.state === 'exited') return REVIEW.exited;
  if (n.state === 'spent') return REVIEW.spent;
  if (n.pending) return { label: 'Payout being confirmed', tone: 'pending' };
  return REVIEW[(n.label && reviews.get(n.label)) || 'unknown'];
}

// The team's Privacy Pools pool, for admins: what it holds, where each deposit stands with the
// association set, deposits, ragequits, and rebuilding the notes from the chain. Nothing opens
// until the admin asks, since opening unlocks their keys.
export default function PoolCard({ onChange }: { onChange: () => void }) {
  const users = useStore((s) => s.users);
  const [info, setInfo] = useState<PoolInfo | null>(null);
  const [pool, setPool] = useState<PoolState | null>(null);
  const [reviews, setReviews] = useState<Map<string, Review>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    poolAccount.info().then(setInfo).catch(toast.error);
  }, []);

  const show = useCallback(async (next: PoolState, ask = false) => {
    setPool(next);
    if (next.state === 'open') setReviews(await poolReview(next.book, [...new Set(next.book.notes.map((n) => n.symbol))], { ask }).catch(() => new Map()));
  }, []);
  const refresh = useCallback(async () => {
    const book = poolAccount.book();
    if (book && pool?.state === 'open') await show({ ...pool, book });
    onChange();
  }, [pool, show, onChange]);

  const run = (label: string, work: () => Promise<unknown>) => async () => {
    setBusy(label);
    try {
      await work();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const open = run('Opening', async () => show(await poolAccount.open()));
  const create = run('Setting up', async () => {
    await show(await poolAccount.create(restoring ? typed : undefined));
    setTyped('');
    setRestoring(false);
  });
  const rebuild = run('Rebuilding', async () => {
    if (!info || pool?.state !== 'open') return;
    await poolRebuild(info, pool.startBlock);
    await refresh();
    toast.show('The pool notes now match the chain.', { tone: 'success' });
  });
  const askProvider = run('Asking the provider', async () => {
    if (pool?.state === 'open') await show({ ...pool, book: poolAccount.book() ?? pool.book }, true);
  });
  const startOver = run('Starting over', async () => {
    setPhrase(null);
    await show(await poolAccount.remove());
  });
  const ragequit = (n: PoolNote) =>
    run('Taking back', async () => {
      const asset = info?.assets.find((a) => a.symbol === n.symbol);
      if (!asset) return;
      await poolRagequit(asset, n, setBusy);
      await refresh();
    })();

  const usable = info?.assets.filter((a) => a.pool && !a.problem) ?? [];
  const book = pool?.state === 'open' ? pool.book : null;
  const balances = book ? noteBook.balances(book, (n) => Boolean(n.label && reviews.get(n.label) === 'approved')) : new Map();

  return (
    <section className="settings-section">
      <h2>Team pool</h2>
      <p>
        Pay bounties from a Privacy Pools pool instead of a team wallet, so the chain doesn’t link the team to the people it pays. Deposits are public; which deposit paid which bounty isn’t.
        {info && !usable.length && ' None of the tokens this server pays in has a pool yet.'}
      </p>
      <div className="settings-card" style={{ padding: 0 }}>
        {!pool && (
          <div className="settings-row" style={{ padding: 14 }}>
            <button type="button" className="btn btn-primary" onClick={open} disabled={Boolean(busy) || !info}>
              {busy && <Spinner size={14} />} Open the team pool
            </button>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>Unlocks your encryption keys, which hold the pool key.</span>
          </div>
        )}

        {pool?.state === 'none' && (
          <div style={{ display: 'grid', gap: 10, padding: 14 }}>
            <span>The team has no pool account yet. Setting one up makes a new pool key and seals it to you; it reaches the other admins as each of them opens this page, once you’ve confirmed their keys.</span>
            {restoring && <input className="input mono" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="twelve recovery words" aria-label="Recovery phrase" spellCheck={false} autoComplete="off" />}
            <div className="settings-row">
              <button type="button" className="btn btn-primary" onClick={create} disabled={Boolean(busy) || (restoring && typed.trim().split(/\s+/).length !== 12)}>
                {busy && <Spinner size={14} />} {restoring ? 'Restore the pool' : 'Set up the team pool'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRestoring(!restoring)}>
                {restoring ? 'Make a new key instead' : 'I have a recovery phrase'}
              </button>
            </div>
          </div>
        )}

        {pool?.state === 'waiting' && (
          <div style={{ padding: 14 }}>
            The pool key hasn’t reached you yet. It’s sealed to you when an admin who holds it ({pool.holders.map((id) => users[id]?.name ?? 'a former admin').join(', ') || 'nobody yet'}) opens this page after confirming your key.
          </div>
        )}

        {book && (
          <>
            <div className="pool-balances">
              {usable.map((a) => {
                const b = balances.get(a.symbol);
                return (
                  <div key={a.symbol} className="pool-balance">
                    <strong>{tokenAmount(b?.total ?? 0n, a.symbol, 4)}</strong>
                    <span>{b && b.usable !== b.total ? `${tokenAmount(b.usable, a.symbol, 4)} ready to pay privately` : 'in the pool'}</span>
                  </div>
                );
              })}
            </div>
            <div className="bounty-list">
              {book.notes.filter((n) => n.state !== 'failed' || n.txHash).map((n) => {
                const s = status(n, reviews);
                return (
                  <div key={`${n.scope}:${n.index}`} className="bounty-item" style={{ cursor: 'default' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="bounty-item-title">
                        <span>{tokenAmount(n.state === 'open' ? n.value : n.deposited, n.symbol, 6)}</span>
                        {n.state === 'open' && n.value !== n.deposited && <span className="muted">left of {tokenAmount(n.deposited, n.symbol, 6)}</span>}
                      </div>
                      <div className="bounty-item-sub">
                        Deposit {n.index + 1}
                        {n.createdAt ? ` · ${dates.ago(n.createdAt)}` : ''} · {n.payouts.length} payout{n.payouts.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span className={`pay-status ${s.tone}`}>{s.label}</span>
                    <div className="bounty-actions">
                      {n.state === 'open' && n.label && (
                        <ConfirmButton className={reviews.get(n.label) === 'declined' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} confirmLabel="Take it back publicly?" onConfirm={() => ragequit(n)}>
                          <Undo2 /> Take back
                        </ConfirmButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {book.notes.some((n) => n.label && reviews.get(n.label) === 'declined') && (
              <div className="plan-notice" style={{ margin: 14 }}>
                The association set declined a deposit, so it can’t pay bounties privately. Take it back: a ragequit returns it, publicly, to the wallet that made it. Nothing else can move it.
              </div>
            )}
            {book.notes.some((n) => n.state === 'open' && n.label && !reviews.has(n.label)) && (
              <div className="settings-row" style={{ padding: '0 14px' }}>
                <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>A deposit not approved yet may still be under review, or declined.</span>
                <ConfirmButton className="btn btn-sm" confirmLabel="This tells the provider these deposits are this server’s. Ask?" onConfirm={askProvider}>
                  Ask the provider
                </ConfirmButton>
              </div>
            )}
            <div className="settings-row" style={{ padding: 14 }}>
              <button type="button" className="btn btn-primary" onClick={() => setDepositing(true)} disabled={Boolean(busy) || !usable.length}>
                <ArrowDownToLine /> Deposit
              </button>
              <button type="button" className="btn" onClick={rebuild} disabled={Boolean(busy)} title="Reads every pool event since the team’s account was made and matches them here">
                {busy === 'Rebuilding' ? <Spinner size={14} /> : <RefreshCw />} Rebuild from the chain
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => (phrase ? setPhrase(null) : poolAccount.phrase().then(setPhrase).catch(toast.error))}>
                <KeyRound /> {phrase ? 'Hide recovery phrase' : 'Recovery phrase'}
              </button>
              {!book.notes.some((n) => n.state === 'open' || n.state === 'sending') && book.notes.length > 0 && (
                <ConfirmButton className="btn btn-ghost" confirmLabel="Drop this key for good?" onConfirm={startOver}>
                  Start over with a new key
                </ConfirmButton>
              )}
              {busy && busy !== 'Rebuilding' && (
                <span className="muted">
                  <Spinner size={14} /> {busy}
                </span>
              )}
            </div>
            {phrase && (
              <div className="pool-phrase">
                <code>{phrase}</code>
                Anyone with these words can spend the team’s pool. Nil already keeps the key sealed to each admin, so this is only a spare: write it down offline, never in a message. It also opens the pool in the Privacy Pools app.
              </div>
            )}
          </>
        )}
      </div>
      {depositing && info && <PoolDepositModal info={info} onClose={() => setDepositing(false)} onDone={refresh} />}
    </section>
  );
}
