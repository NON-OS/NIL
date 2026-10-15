import { useState } from 'react';
import Modal from '../ui/Modal';
import Picker from '../ui/Picker';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import votes from '../../actions/votes';

const DURATIONS = [1, 3, 7, 14, 30].map((d) => ({ value: String(d), label: d === 1 ? '1 day' : `${d} days` }));

export default function NewProposalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const nox = useStore((s) => s.nox);
  const [form, setForm] = useState({ title: '', body: '', options: 'Yes\nNo\nAbstain', weighting: 'equal' as 'equal' | 'nox', sealed: false, days: 7 });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const options = form.options.split('\n').map((o) => o.trim()).filter(Boolean);

  const create = async () => {
    setBusy(true);
    try {
      await votes.create({ ...form, options });
      toast.show('Vote started. Everyone was notified.', { tone: 'success' });
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New vote"
      onClose={onClose}
      width={600}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={create} disabled={busy || !form.title.trim() || options.length < 2}>
            {busy && <Spinner size={14} />} Start vote
          </button>
        </>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        <label className="field">
          <span>Question</span>
          <input className="input" autoFocus maxLength={200} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Ship the mobile app before the web redesign?" />
        </label>
        <label className="field">
          <span>Details</span>
          <textarea className="textarea" rows={3} maxLength={10_000} value={form.body} onChange={(e) => set({ body: e.target.value })} placeholder="Context, links, what happens if it passes" />
        </label>
        <label className="field">
          <span>Options, one per line</span>
          <textarea className="textarea" rows={3} value={form.options} onChange={(e) => set({ options: e.target.value })} />
          <small>Between 2 and 8.</small>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <Picker
            title="Who counts how much"
            options={[{ value: 'equal', label: 'One person, one vote' }, ...(nox ? [{ value: 'nox', label: `Weighted by ${nox.symbol} held` }] : [])]}
            value={form.weighting}
            onChange={(v) => set({ weighting: v as 'equal' | 'nox' })}
            className="btn"
            width={240}
          >
            {form.weighting === 'nox' ? `Weighted by ${nox?.symbol ?? 'NOX'}` : 'One person, one vote'}
          </Picker>
          <Picker title="Open for" options={DURATIONS} value={String(form.days)} onChange={(v) => set({ days: Number(v) })} className="btn" width={160}>
            Open {form.days === 1 ? '1 day' : `${form.days} days`}
          </Picker>
          <label className="filter-toggle">
            <button type="button" className="toggle" role="switch" aria-checked={form.sealed} onClick={() => set({ sealed: !form.sealed })} aria-label="Seal results until it closes" />
            Seal results until it closes
          </label>
        </div>
        {form.weighting === 'nox' && (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Each vote counts the {nox?.symbol ?? 'NOX'} in the voter’s linked wallets: the smaller of their balance when they vote and when the vote closes, so tokens passed around mid-vote count only once.
          </p>
        )}
      </div>
    </Modal>
  );
}
