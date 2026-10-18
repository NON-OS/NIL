import { useMemo, useState } from 'react';
import { Presentation, Sparkles } from 'lucide-react';
import Modal from '../ui/Modal';
import Picker from '../ui/Picker';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import decks from '../../actions/decks';
import AiMode from '../ai/AiMode';
import type DeckScope from '../../types/DeckScope';

const PERIODS = [7, 14, 30].map((d) => ({ value: String(d), label: `Last ${d} days` }));

// One click to a real .pptx: built in this browser, styled in the NØNOS brand, with editable
// charts and speaker notes. Claude can write the summary and notes if AI is on.
export default function DeckModal() {
  const preset = useStore((s) => s.deck.preset);
  const projects = useStore((s) => s.projects);
  const goals = useStore((s) => s.goals);
  const aiOn = useStore((s) => s.ai);
  const cryptoTools = useStore((s) => s.workspace.cryptoTools);
  const [scope, setScope] = useState<DeckScope>({ kind: preset?.kind ?? 'workspace', id: preset?.id, days: preset?.days ?? 14, includePrivate: false });
  const [withAi, setWithAi] = useState(aiOn);
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => [
      { value: 'workspace', label: 'Whole workspace' },
      ...Object.values(projects).filter((p) => !p.archived).map((p) => ({ value: `project:${p.id}`, label: `Project · ${p.name}` })),
      ...Object.values(goals).map((g) => ({ value: `goal:${g.id}`, label: `Goal · ${g.title}` })),
    ],
    [projects, goals],
  );
  const current = scope.kind === 'workspace' ? 'workspace' : `${scope.kind}:${scope.id}`;

  const create = async () => {
    setBusy(true);
    try {
      const facts = await decks.create(scope, withAi && aiOn);
      toast.show(`Deck ready: ${facts.title}. Check your downloads.`, { tone: 'success' });
      decks.close();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create a status deck"
      onClose={decks.close}
      width={540}
      footer={
        <>
          <button type="button" className="btn" onClick={decks.close}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
            {busy ? <Spinner size={14} /> : <Presentation />} Download .pptx
          </button>
        </>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        <div className="settings-row">
          <Picker title="What it covers" options={options} value={current} onChange={(v) => setScope({ ...scope, kind: v === 'workspace' ? 'workspace' : (v.split(':')[0] as 'project' | 'goal'), id: v.split(':')[1] })} className="btn" width={300}>
            {options.find((o) => o.value === current)?.label ?? 'Whole workspace'}
          </Picker>
          <Picker title="Period" options={PERIODS} value={String(scope.days)} onChange={(v) => setScope({ ...scope, days: Number(v) as DeckScope['days'] })} className="btn" width={180}>
            Last {scope.days} days
          </Picker>
        </div>
        <label className="filter-toggle">
          <button type="button" className="toggle" role="switch" aria-checked={scope.includePrivate} onClick={() => setScope({ ...scope, includePrivate: !scope.includePrivate })} aria-label="Include my private tasks" />
          Include my private tasks
        </label>
        {aiOn && (
          <label className="filter-toggle">
            <button type="button" className="toggle" role="switch" aria-checked={withAi} onClick={() => setWithAi(!withAi)} aria-label="Let Claude write the summary and speaker notes" />
            <span>
              <Sparkles size={13} style={{ verticalAlign: '-2px' }} /> Claude writes the summary, highlights and speaker notes
            </span>
          </label>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          The deck is built in your browser: cover, at a glance, shipped, in progress, goals (an editable chart), risks, {cryptoTools ? 'bounties and ' : ''}next steps, each with speaker notes.
          {aiOn && withAi ? ' With Claude on, the task titles, names and counts on the slides go to Anthropic through this Nil server as readable text. Private tasks never go; they stay on your slides only.' : ' Nothing leaves this device.'}
        </p>
        {aiOn && withAi && <AiMode />}
      </div>
    </Modal>
  );
}
