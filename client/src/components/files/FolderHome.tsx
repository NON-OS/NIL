import './Files.css';
import { useMemo, useState } from 'react';
import { Clock, FolderLock, FolderPlus, Lock, SearchX, ShieldAlert, Users } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import Spinner from '../ui/Spinner';
import KeyNotice from '../keys/KeyNotice';
import NewFolderModal from './NewFolderModal';
import StorageMeter from './StorageMeter';
import UnfinishedUploads from './UnfinishedUploads';
import useStore from '../../state/useStore';
import router from '../../lib/router';
import dates from '../../lib/dates';
import type FilesOverview from '../../types/FilesOverview';

interface Props {
  overview: FilesOverview | null;
  error: string;
  onRetry: () => void;
}

// The shared folders you can open, the team folders whose key is still on its way to you, and
// how much of your file space you've used. Search runs over the names this tab decrypted.
export default function FolderHome({ overview, error, onRetry }: Props) {
  const users = useStore((s) => s.users);
  const [query, setQuery] = useState('');
  const [making, setMaking] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = overview?.folders ?? [];
    return (q ? list.filter((f) => f.name.toLowerCase().includes(q)) : list).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [overview, query]);

  if (!overview) {
    return error ? (
      <div className="files-page">
        <EmptyState icon={<FolderLock />} title="Your folders couldn’t be loaded" actions={<button type="button" className="btn" onClick={onRetry}>Try again</button>}>
          {error}
        </EmptyState>
      </div>
    ) : (
      <div className="files-state" role="status">
        <Spinner size={20} />
        <span>Opening your folders…</span>
      </div>
    );
  }

  const nothing = !overview.folders.length && !overview.waiting.length;
  return (
    <div className="files-page">
      <KeyNotice reason="shared folders" />
      {!nothing && (
        <div className="files-bar">
          <button type="button" className="btn btn-primary" onClick={() => setMaking(true)}>
            <FolderPlus /> New folder
          </button>
          <input className="input files-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search folders" aria-label="Search folders" />
        </div>
      )}
      {nothing ? (
        <EmptyState
          icon={<FolderLock />}
          title="No shared folders yet"
          actions={
            <button type="button" className="btn btn-primary" onClick={() => setMaking(true)}>
              <FolderPlus /> New folder
            </button>
          }
        >
          A shared folder keeps files only the people you choose can open. Your browser encrypts each file, its name included, before it leaves.
        </EmptyState>
      ) : shown.length || overview.waiting.length ? (
        <ul className="files-grid" aria-label="Shared folders">
          {shown.map((f) => (
            <li key={f.id} className="files-tile files-folder-card">
              <a className="files-open" href={`/files/${f.id}`} onClick={router.link(`/files/${f.id}`)}>
                <span className="files-art">{f.audience === 'team' ? <Users aria-hidden="true" /> : <FolderLock aria-hidden="true" />}</span>
                <span className="files-name">
                  <strong>{f.name}</strong>
                  <small>
                    {f.warning && <ShieldAlert className="files-warn" aria-label={f.warning === 'unverified' ? 'Not verified' : 'Older than a version seen before'} />}
                    {f.audience === 'team' ? <Users aria-hidden="true" /> : <Lock aria-hidden="true" />}
                    {f.audience === 'team' ? 'Team' : `${f.readers.length} ${f.readers.length === 1 ? 'person' : 'people'}`} · {dates.ago(f.updatedAt)}
                  </small>
                </span>
              </a>
            </li>
          ))}
          {!query &&
            overview.waiting.map((w) => (
              <li key={w.id} className="files-tile files-folder-card files-waiting" title="A teammate’s browser hands you the key once they’ve confirmed your key">
                <span className="files-open">
                  <span className="files-art locked">
                    <Clock aria-hidden="true" />
                  </span>
                  <span className="files-name">
                    <strong>Encrypted folder</strong>
                    <small>Waiting for a key from {w.createdBy ? (users[w.createdBy]?.name ?? 'a teammate') : 'a teammate'}</small>
                  </span>
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <EmptyState icon={<SearchX />} title="No folder by that name" />
      )}
      <StorageMeter usage={overview.usage} />
      <UnfinishedUploads onChanged={onRetry} />
      {making && <NewFolderModal onClose={() => setMaking(false)} onMade={(f) => router.navigate(`/files/${f.id}`)} />}
    </div>
  );
}
