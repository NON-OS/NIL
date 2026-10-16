import { useState } from 'react';
import guessColumns from '../../lib/import/guessColumns';
import type CsvColumns from '../../types/CsvColumns';

const FIELDS: { key: keyof CsvColumns; label: string }[] = [
  { key: 'title', label: 'Task name' },
  { key: 'description', label: 'Notes' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'person', label: 'Assignee' },
  { key: 'project', label: 'Project' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'labels', label: 'Labels' },
];

// For a CSV from anywhere else: which column holds what. Common header names are matched
// already; the first data row is shown next to each choice so it's easy to check.
export default function CsvColumnPicker({ rows, onDone, onCancel }: { rows: string[][]; onDone: (columns: CsvColumns) => void; onCancel: () => void }) {
  const [header, sample] = rows;
  const [columns, setColumns] = useState(() => guessColumns(header));

  return (
    <div className="import-step">
      <p className="muted">Match the columns of your file. Only the task name is needed.</p>
      <div className="import-columns">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="field">
            <span>{label}</span>
            <select className="select" value={columns[key]} onChange={(e) => setColumns({ ...columns, [key]: Number(e.target.value) })}>
              <option value={-1}>{key === 'title' ? 'Pick a column' : 'Not in this file'}</option>
              {header.map((name, i) => (
                <option key={i} value={i}>
                  {name.trim() || `Column ${i + 1}`}
                </option>
              ))}
            </select>
            {columns[key] >= 0 && sample?.[columns[key]] && <small>For example: {sample[columns[key]].slice(0, 80)}</small>}
          </label>
        ))}
      </div>
      <div className="settings-row">
        <button type="button" className="btn btn-primary" disabled={columns.title < 0} onClick={() => onDone(columns)}>
          Continue
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Pick another file
        </button>
      </div>
    </div>
  );
}
