import '../components/proofs/Proofs.css';
import '../components/bounty/Bounty.css';
import { useEffect, useState } from 'react';
import { CheckCircle2, Coins } from 'lucide-react';
import NilLogo from '../components/brand/NilLogo';
import Spinner from '../components/ui/Spinner';
import ApplyForm from '../components/bounty/ApplyForm';
import http from '../api/http';
import router from '../lib/router';
import dates from '../lib/dates';
import formatUnits from '../lib/formatUnits';
import type PublicBounty from '../types/PublicBounty';

// The public bounty board: tasks a team chose to open to anyone, paid wallet to wallet.
// The same list is published at /.well-known/nonos-bounties.json for anyone to index.
export default function OpenBountiesPage() {
  const [data, setData] = useState<{ workspace: string | null; items: PublicBounty[] } | null>(null);
  const [open, setOpen] = useState<string | null>(location.hash.slice(1) || null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  useEffect(() => {
    http.get<{ workspace: string | null; items: PublicBounty[] }>('/public/bounties').then(setData).catch(() => setData({ workspace: null, items: [] }));
  }, []);

  return (
    <div className="verify-standalone">
      <header>
        <NilLogo height={42} />
        <a className="btn btn-sm" href="/" onClick={router.link('/')}>
          Sign in
        </a>
      </header>
      <div className="page page-narrow">
        <span className="eyebrow">{data?.workspace ? `${data.workspace} · open bounties` : 'Open bounties'}</span>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 500, margin: '6px 0 6px' }}>Get paid for work, wallet to wallet</h1>
        <p className="muted" style={{ marginBottom: 20, maxWidth: '62ch' }}>
          These tasks are open to anyone. Apply by signing with your wallet; if the team accepts, you sign in with the same wallet, deliver, and the reward is sent straight to you, with a signed receipt for your proof of work.
        </p>
        {!data ? (
          <Spinner size={20} />
        ) : data.items.length === 0 ? (
          <p className="muted">No open bounties right now. Check back later.</p>
        ) : (
          <div className="open-bounties">
            {data.items.map((b) => (
              <article key={b.id} id={b.id} className="open-bounty">
                <div className="open-bounty-head">
                  <span className="mono muted">{b.ref}</span>
                  <h2>{b.title}</h2>
                  <span className="bounty-chip">
                    <Coins /> {formatUnits(b.reward.amount, b.reward.decimals, 2)} {b.reward.symbol}
                  </span>
                </div>
                {b.summary && <p className="open-bounty-summary">{b.summary}</p>}
                <div className="open-bounty-foot">
                  <span className="muted">
                    {b.due ? `Due ${dates.short(b.due)} · ` : ''}listed {dates.ago(Date.parse(b.listedAt))}
                    {b.applicants ? ` · ${b.applicants} applied` : ''}
                  </span>
                  {applied.has(b.id) ? (
                    <span className="pay-status confirmed">
                      <CheckCircle2 /> Applied. Sign in with this wallet once the team accepts.
                    </span>
                  ) : !b.acceptingApplications ? (
                    <span className="muted">Not taking applications right now</span>
                  ) : (
                    open !== b.id && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(b.id)}>
                        Apply
                      </button>
                    )
                  )}
                </div>
                {open === b.id && b.acceptingApplications && !applied.has(b.id) && <ApplyForm bounty={b} onDone={() => setApplied(new Set([...applied, b.id]))} />}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
