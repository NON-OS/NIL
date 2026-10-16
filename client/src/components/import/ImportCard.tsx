import './Import.css';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import CsvColumnPicker from './CsvColumnPicker';
import ImportReview from './ImportReview';
import ImportRun from './ImportRun';
import runImport from '../../actions/runImport';
import readImportFile from '../../lib/import/readImportFile';
import fromCsv from '../../lib/import/fromCsv';
import type ImportFile from '../../types/ImportFile';
import type ImportPlan from '../../types/ImportPlan';
import type ImportProgress from '../../types/ImportProgress';

// big enough for years of a busy board, small enough to read in a browser tab
const MAX_BYTES = 50_000_000;

type Step = { kind: 'pick' } | { kind: 'columns'; name: string; rows: string[][] } | { kind: 'review'; file: ImportFile } | { kind: 'run'; progress: ImportProgress };

// Bringing tasks over from Todoist, Trello or any CSV. The file is read and turned into
// tasks in this browser; only the tasks themselves go to the server, one by one, through the
// same calls the app always uses.
export default function ImportCard() {
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [error, setError] = useState('');
  const stop = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const read = await readImportFile(file, MAX_BYTES);
      setStep(read.kind === 'ready' ? { kind: 'review', file: read.file } : { kind: 'columns', name: read.name, rows: read.rows });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file couldn’t be read.');
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  const start = async (file: ImportFile, plan: ImportPlan) => {
    stop.current = false;
    setError('');
    setStep({ kind: 'run', progress: { total: plan.items.length, done: 0, failed: 0, errors: [], finished: false, stopped: false } });
    try {
      await runImport(plan, (progress) => setStep({ kind: 'run', progress }), () => stop.current);
    } catch (err) {
      // unlocking the wallet for private tasks failed, so nothing was sent
      setError(err instanceof Error ? err.message : 'The import couldn’t start.');
      setStep({ kind: 'review', file });
    }
  };

  const again = () => {
    setError('');
    setStep({ kind: 'pick' });
  };

  return (
    <div className="settings-card import-card">
      {error && (
        <div className="import-error" role="alert">
          {error}
        </div>
      )}
      {step.kind === 'pick' && (
        <div className="import-step">
          <p className="muted">
            Bring tasks over from Todoist (a project exported as CSV), Trello (a board exported as JSON) or any CSV file with a header row. The file is read in your browser; only the tasks you import are sent to your server.
          </p>
          <div className="settings-row">
            <button type="button" className="btn" onClick={() => input.current?.click()}>
              <Upload /> Choose a file
            </button>
            <input ref={input} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
        </div>
      )}
      {step.kind === 'columns' && <CsvColumnPicker rows={step.rows} onCancel={again} onDone={(columns) => setStep({ kind: 'review', file: fromCsv(step.rows, columns, step.name) })} />}
      {step.kind === 'review' && <ImportReview key={step.file.name} file={step.file} onStart={(plan) => start(step.file, plan)} onCancel={again} />}
      {step.kind === 'run' && <ImportRun progress={step.progress} onStop={() => (stop.current = true)} onAgain={again} />}
    </div>
  );
}
