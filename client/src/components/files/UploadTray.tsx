import './Files.css';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronUp, RotateCw, X } from 'lucide-react';
import uploadQueue from '../../actions/uploadQueue';
import fileSize from '../../lib/fileSize';

// how long a tray of finished uploads stays up before it clears itself
const LINGER = 6000;
const STATUS = { queued: 'Waiting', uploading: 'Encrypting and uploading', done: 'Encrypted and uploaded', stopped: 'Stopped', failed: 'Failed' };

// Every upload in this tab, with its progress, a way to stop it, and to try again when one fails.
export default function UploadTray() {
  const jobs = useSyncExternalStore(uploadQueue.subscribe, uploadQueue.snapshot);
  const [folded, setFolded] = useState(false);
  const going = jobs.filter((j) => j.status === 'queued' || j.status === 'uploading');
  const failed = jobs.filter((j) => j.status === 'failed').length;
  const settled = jobs.length > 0 && !going.length && !failed;

  useEffect(() => {
    if (!settled) return;
    const later = setTimeout(() => uploadQueue.clear(), LINGER);
    return () => clearTimeout(later);
  }, [settled, jobs]);

  if (!jobs.length) return null;
  const title = going.length ? `Uploading ${going.length} ${going.length === 1 ? 'file' : 'files'}` : failed ? `${failed} ${failed === 1 ? 'upload' : 'uploads'} failed` : 'Uploads finished';

  return (
    <section className="files-tray" aria-label="Uploads">
      <div className="files-tray-head">
        <span role="status">{title}</span>
        {!going.length && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => uploadQueue.clear()}>
            Clear
          </button>
        )}
        <button type="button" className="icon-btn" onClick={() => setFolded((f) => !f)} aria-label={folded ? 'Show uploads' : 'Hide uploads'} aria-expanded={!folded}>
          {folded ? <ChevronUp /> : <ChevronDown />}
        </button>
      </div>
      {!folded && (
        <ul className="files-tray-list">
          {jobs.map((job) => (
            <li key={job.id} className="files-job">
              <strong title={job.name}>{job.name}</strong>
              {job.status === 'failed' || job.status === 'stopped' ? (
                <button type="button" className="icon-btn" onClick={() => uploadQueue.retry(job.id)} aria-label={`Try ${job.name} again`}>
                  <RotateCw />
                </button>
              ) : job.status !== 'done' ? (
                <button type="button" className="icon-btn" onClick={() => uploadQueue.stop(job.id)} aria-label={`Stop uploading ${job.name}`}>
                  <X />
                </button>
              ) : (
                <span />
              )}
              {job.status === 'uploading' && (
                <div className="files-progress" role="progressbar" aria-label={`${job.name} upload`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
                  <i style={{ width: `${Math.round(job.progress * 100)}%` }} />
                </div>
              )}
              <small className={job.status === 'failed' ? 'failed' : undefined}>
                {job.error ?? STATUS[job.status]} · <span className="num">{job.status === 'uploading' ? `${Math.round(job.progress * 100)}% of ${fileSize(job.size)}` : fileSize(job.size)}</span>
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
