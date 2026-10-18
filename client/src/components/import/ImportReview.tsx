import { useMemo, useState } from 'react';
import ImportPreview from './ImportPreview';
import useStore from '../../state/useStore';
import foldText from '../../lib/foldText';
import guessMatch from '../../lib/import/guessMatch';
import type ImportFile from '../../types/ImportFile';
import type ImportPlan from '../../types/ImportPlan';
import countOf from '../../lib/countOf';

const SOURCE = { todoist: 'Todoist', trello: 'Trello', csv: 'CSV' };
const NEW = '+new';
const unique = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))];

// What's in the file, and where it goes: each person and project named in it is matched to
// someone or something here (best guesses filled in), and the tasks can all be made private.
export default function ImportReview({ file, onStart, onCancel }: { file: ImportFile; onStart: (plan: ImportPlan) => void; onCancel: () => void }) {
  const userMap = useStore((s) => s.users);
  const projectMap = useStore((s) => s.projects);
  const labelMap = useStore((s) => s.labels);
  const users = useMemo(() => Object.values(userMap).filter((u) => !u.deactivated && u.role !== 'guest'), [userMap]);
  const projects = useMemo(() => Object.values(projectMap).filter((p) => !p.archived), [projectMap]);
  const names = useMemo(() => ({ people: unique(file.items.map((i) => i.person)), projects: unique(file.items.map((i) => i.project)) }), [file]);

  const [people, setPeople] = useState(() => Object.fromEntries(names.people.map((n) => [n, guessMatch(n, users) ?? ''])));
  const [targets, setTargets] = useState(() => Object.fromEntries(names.projects.map((n) => [n, guessMatch(n, projects) ?? NEW])));
  const [makePrivate, setMakePrivate] = useState(false);

  const plan: ImportPlan = {
    items: file.items,
    people: Object.fromEntries(Object.entries(people).map(([n, id]) => [n, id || null])),
    projects: Object.fromEntries(Object.entries(targets).map(([n, t]) => [n, t === NEW ? { create: true } : t ? { id: t } : null])),
    makePrivate,
  };
  const comments = file.items.reduce((sum, i) => sum + i.comments.length, 0);
  const known = new Set(Object.values(labelMap).map((l) => foldText(l.name)));
  const missingLabels = unique(file.items.flatMap((i) => i.labels)).filter((l) => !known.has(foldText(l)));

  if (!file.items.length) {
    return (
      <div className="import-step">
        <p>There are no tasks in {file.name}.</p>
        <button type="button" className="btn" onClick={onCancel}>
          Pick another file
        </button>
      </div>
    );
  }

  return (
    <div className="import-step">
      <p>
        <strong>{file.name}</strong> from {SOURCE[file.source]}: {[countOf(file.items.length, 'task'), comments && countOf(comments, 'comment'), names.projects.length && countOf(names.projects.length, 'project'), names.people.length && countOf(names.people.length, 'person', 'people')].filter(Boolean).join(' · ')}.
        {file.skipped > 0 && ` ${countOf(file.skipped, 'row')} that weren’t open tasks are left out.`}
      </p>

      <ImportPreview plan={plan} />

      {names.people.length > 0 && (
        <fieldset className="import-map">
          <legend>People</legend>
          {names.people.map((name) => (
            <label key={name}>
              <span>{name}</span>
              <select className="select" value={people[name]} onChange={(e) => setPeople({ ...people, [name]: e.target.value })}>
                <option value="">Leave unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {names.projects.length > 0 && (
        <fieldset className="import-map">
          <legend>Projects</legend>
          {names.projects.map((name) => (
            <label key={name}>
              <span>{name}</span>
              <select className="select" value={targets[name]} onChange={(e) => setTargets({ ...targets, [name]: e.target.value })}>
                <option value={NEW}>Create “{name}”</option>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {missingLabels.length > 0 && (
        <p className="muted">
          Labels that exist here are added to tasks. These don’t yet and are left off: {missingLabels.slice(0, 8).join(', ')}
          {missingLabels.length > 8 ? ` and ${missingLabels.length - 8} more` : ''}. Create them in Settings, Labels first to keep them.
        </p>
      )}

      <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
        <span>
          <strong>Make every imported task private</strong>
          <br />
          <span className="muted">Only you and each task’s assignee can read them. Your browser encrypts each one before it’s saved, and your wallet is asked once before the import starts.</span>
        </span>
        <button type="button" className="toggle" role="switch" aria-checked={makePrivate} onClick={() => setMakePrivate((v) => !v)} aria-label="Make every imported task private" />
      </label>

      <div className="settings-row">
        <button type="button" className="btn btn-primary" onClick={() => onStart(plan)}>
          Import {countOf(file.items.length, 'task')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Pick another file
        </button>
      </div>
    </div>
  );
}
