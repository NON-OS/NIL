import '../components/bounty/Bounty.css';
import '../components/proofs/Proofs.css';
import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Download, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import useStore from '../state/useStore';
import toast from '../state/toast';
import proofs from '../actions/proofs';
import buildProof from '../lib/buildProof';
import saveBlob from '../lib/saveBlob';
import router from '../lib/router';
import dates from '../lib/dates';
import type Receipt from '../types/Receipt';
import noxAmount from '../lib/noxAmount';

export default function ProofsView() {
  const me = useStore((s) => s.me)!;
  const workspace = useStore((s) => s.workspace);
  const [data, setData] = useState<{ key: string; fingerprint: string; receipts: Receipt[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [withName, setWithName] = useState(true);

  useEffect(() => {
    proofs
      .mine()
      .then((d) => {
        setData(d);
        setPicked(new Set(d.receipts.map((r) => r.id)));
      })
      .catch(toast.error);
  }, []);

  const receipts = data?.receipts ?? [];
  const chosen = useMemo(() => receipts.filter((r) => picked.has(r.id)), [receipts, picked]);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const download = () => {
    if (!data || !chosen.length) return;
    const bundle = buildProof({ workspace: { name: workspace.name, key: data.key }, receipts: chosen, reveal, name: withName ? me.name : undefined });
    const slug = (withName ? me.name : 'contributor').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    saveBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }), `nonos-proof-${slug}-${dates.today()}.json`);
    toast.show(`Proof saved with ${chosen.length} receipt${chosen.length === 1 ? '' : 's'}.`, { tone: 'success' });
  };

  const revealedCount = chosen.filter((r) => reveal.has(r.id) && r.title).length;

  return (
    <div className="main">
      <ViewHeader
        title="Proof of work"
        icon={<BadgeCheck size={17} />}
        actions={
          <button type="button" className="btn btn-primary" onClick={download} disabled={!chosen.length}>
            <Download /> Download proof
          </button>
        }
      />
      <div className="page page-narrow">
        <section className="proof-intro">
          <div>
            <h2>Your work, provable anywhere</h2>
            <p>
              Every task you finish gets a receipt signed by this workspace, and every bounty paid to you adds a payment receipt that points to the on-chain transfer. Download a proof for a DAO, a grant, a client or your next job. Task titles stay hidden unless you reveal them, and anyone can check the file at <a href="/verify" onClick={router.link('/verify')}>/verify</a> without signing in or uploading anything.
            </p>
          </div>
          {data && (
            <div className="proof-key">
              <span className="eyebrow">Workspace key</span>
              <code>{data.fingerprint}</code>
            </div>
          )}
        </section>

        {!data ? (
          <Spinner size={20} />
        ) : receipts.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="No receipts yet">
            Finish a task that’s assigned to you and its signed receipt appears here.
          </EmptyState>
        ) : (
          <div className="panel">
            <div className="proof-toolbar">
              <label className="filter-toggle">
                <input type="checkbox" checked={picked.size === receipts.length} onChange={(e) => setPicked(e.target.checked ? new Set(receipts.map((r) => r.id)) : new Set())} aria-label="Select all" />
                {chosen.length} of {receipts.length} selected
              </label>
              <button type="button" className="btn btn-sm" onClick={() => setReveal(reveal.size ? new Set() : new Set(receipts.filter((r) => r.title).map((r) => r.id)))}>
                {reveal.size ? <EyeOff /> : <Eye />} {reveal.size ? 'Hide all titles' : 'Reveal all titles'}
              </button>
              <label className="filter-toggle" style={{ marginLeft: 'auto' }}>
                <button type="button" className="toggle" role="switch" aria-checked={withName} onClick={() => setWithName(!withName)} aria-label="Include my name" />
                Include my name
              </label>
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{revealedCount} title{revealedCount === 1 ? '' : 's'} revealed</span>
            </div>
            {receipts.map((r) => (
              <div key={r.id} className="proof-row">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked(toggle(picked, r.id))} aria-label={`Include ${r.ref}`} />
                <span className="ref mono muted">{r.ref}</span>
                <span className={`title${reveal.has(r.id) ? '' : ' hidden-title'}`}>
                  {r.kind === 'payment' && r.amount && <span className="bounty-chip paid" style={{ marginRight: 8, fontStyle: 'normal' }}>Paid {noxAmount(r.amount)}</span>}
                  {r.title ?? 'Title erased by a retention policy'}
                </span>
                <span className="date muted num" style={{ fontSize: 'var(--text-sm)' }}>{dates.short(r.completedAt.slice(0, 10))}</span>
                <button type="button" className="icon-only" aria-pressed={reveal.has(r.id)} disabled={r.title === null} onClick={() => setReveal(toggle(reveal, r.id))} aria-label={reveal.has(r.id) ? `Hide title of ${r.ref}` : `Reveal title of ${r.ref}`} title={reveal.has(r.id) ? 'Title will be revealed' : 'Title stays hidden'}>
                  {reveal.has(r.id) ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
