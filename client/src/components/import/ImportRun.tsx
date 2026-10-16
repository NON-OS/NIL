import type ImportProgress from '../../types/ImportProgress';

// How far an import has got, and how it ended.
export default function ImportRun({ progress, onStop, onAgain }: { progress: ImportProgress; onStop: () => void; onAgain: () => void }) {
  const handled = progress.done + progress.failed;
  const pct = progress.total ? Math.round((handled / progress.total) * 100) : 100;

  return (
    <div className="import-step">
      <div className="import-bar" role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <p aria-live="polite">
        {progress.finished
          ? `${progress.stopped ? 'Stopped. ' : 'Done. '}${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} tasks imported.`
          : `Importing ${handled.toLocaleString()} of ${progress.total.toLocaleString()}…`}
        {progress.failed > 0 && ` ${progress.failed.toLocaleString()} couldn’t be imported.`}
      </p>
      {progress.errors.length > 0 && (
        <ul className="import-errors">
          {progress.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="settings-row">
        {progress.finished ? (
          <button type="button" className="btn" onClick={onAgain}>
            Import another file
          </button>
        ) : (
          <button type="button" className="btn" onClick={onStop}>
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
