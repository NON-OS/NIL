import { useState } from 'react';
import Modal from '../ui/Modal';
import Picker from '../ui/Picker';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import votes from '../../actions/votes';
import TrusteePicker from './TrusteePicker';
import HelpLink from '../help/HelpLink';

const DURATIONS = [1, 3, 7, 14, 30].map((d) => ({ value: String(d), label: d === 1 ? '1 day' : `${d} days` }));

export default function NewProposalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const nox = useStore((s) => s.nox);
  const [form, setForm] = useState({ title: '', body: '', options: 'Yes\nNo\nAbstain', weighting: 'equal' as 'equal' | 'power', sealed: false, anonymous: false, publicBallots: true, publicVote: false, days: 7, trustees: [] as string[] });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const options = form.options.split('\n').map((o) => o.trim()).filter(Boolean);
  // open to any NOX holder: only a signed vote counted by voting power can be
  const canBePublic = Boolean(nox) && nox?.publicVotes !== false && form.weighting === 'power' && !form.anonymous;
  const publicVote = canBePublic && form.publicVote;

  const create = async () => {
    setBusy(true);
    try {
      await votes.create({ ...form, options, publicVote, publicBallots: publicVote || (!form.anonymous && form.publicBallots), trustees: form.anonymous && form.weighting === 'power' ? form.trustees : undefined });
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
          <button type="button" className="btn btn-primary" onClick={create} disabled={busy || !form.title.trim() || options.length < 2 || (form.anonymous && form.weighting === 'power' && form.trustees.length !== 3)}>
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
            options={[{ value: 'equal', label: 'One person, one vote' }, ...(nox ? [{ value: 'power', label: 'Voting power', hint: `${nox.symbol} held or staked, plus Zero-State Passes` }] : [])]}
            value={form.weighting}
            onChange={(v) => set({ weighting: v as 'equal' | 'power' })}
            className="btn"
            width={340}
          >
            {form.weighting === 'power' ? 'Voting power' : 'One person, one vote'}
          </Picker>
          <Picker title="Open for" options={DURATIONS} value={String(form.days)} onChange={(v) => set({ days: Number(v) })} className="btn" width={160}>
            Open {form.days === 1 ? '1 day' : `${form.days} days`}
          </Picker>
          <label className="filter-toggle">
            <button type="button" className="toggle" role="switch" aria-checked={form.sealed} onClick={() => set({ sealed: !form.sealed })} aria-label="Seal results until it closes" />
            Seal results until it closes
          </label>
          <label className="filter-toggle">
            <button type="button" className="toggle" role="switch" aria-checked={form.anonymous} onClick={() => set({ anonymous: !form.anonymous })} aria-label="Anonymous ballots" />
            Anonymous ballots
          </label>
          {!form.anonymous && !publicVote && (
            <label className="filter-toggle">
              <button type="button" className="toggle" role="switch" aria-checked={form.publicBallots} onClick={() => set({ publicBallots: !form.publicBallots })} aria-label="Members can see who voted what" />
              Members can see who voted what
            </label>
          )}
          {canBePublic && (
            <label className="filter-toggle">
              <button type="button" className="toggle" role="switch" aria-checked={form.publicVote} onClick={() => set({ publicVote: !form.publicVote })} aria-label="Public vote: any NOX holder can vote, anyone can watch" />
              Public vote: any {nox?.symbol ?? 'NOX'} holder can vote, anyone can watch
            </label>
          )}
          <HelpLink topic="votes" label="Which kind of vote to pick" newTab />
        </div>
        {publicVote && (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            The vote gets a page of its own, with a link you share. Anyone who opens it sees the question, the totals and every ballot: each wallet, its choice and its power. Anyone holding {nox?.symbol ?? 'NOX'}, staked {nox?.symbol ?? 'NOX'} or Zero-State Passes when the vote opens can vote there with their wallet, without an account. Members can vote there or here, and count once either way.
          </p>
        )}
        {!form.anonymous && !publicVote && form.publicBallots && (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Each voter’s wallet signs their ballot. Everyone in the workspace sees who voted for what, and any member can download the audit file with every wallet and its choice. Guests see nothing. Turn on anonymous ballots when choices must stay private.
          </p>
        )}
        {!form.anonymous && !form.publicBallots && (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Each voter’s wallet signs their ballot. It isn’t secret: admins can see who voted for what, and the audit file lists every wallet with its choice. Turn on anonymous ballots when choices must stay private.
          </p>
        )}
        {form.anonymous && form.weighting === 'equal' && (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Each ballot is a zero-knowledge proof (Semaphore) that some member voted, without saying who. Nobody can see who chose what, not even admins or this server, and each member still gets exactly one vote.
          </p>
        )}
        {form.anonymous && form.weighting === 'power' && (
          <>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              Each ballot carries the voter’s power encrypted, with a zero-knowledge proof that it’s their real snapshotted power and a real option. Nobody sees who voted, what they chose or how much weight they carry; three trustees decrypt only the final totals. Encrypted ballots use NØNOS’s own circuit, which is in beta until it has been audited.
            </p>
            <TrusteePicker value={form.trustees} onChange={(trustees) => set({ trustees })} />
          </>
        )}
        {form.weighting === 'power' && (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Each member’s power is read from the chain when the vote opens, all at the same block: {nox?.symbol ?? 'NOX'} in their linked wallets, {nox?.symbol ?? 'NOX'} staked in the official staking contract, and the Zero-State Pass NFTs they hold, each worth the workspace’s power per pass. Tokens moved afterwards don’t change it.
          </p>
        )}
      </div>
    </Modal>
  );
}
