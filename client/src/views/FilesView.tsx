import '../components/files/Files.css';
import { useCallback, useEffect, useState } from 'react';
import { Folder, FolderLock } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import EmptyState from '../components/ui/EmptyState';
import FilesLocked from '../components/files/FilesLocked';
import FolderHome from '../components/files/FolderHome';
import FolderBrowser from '../components/files/FolderBrowser';
import UploadTray from '../components/files/UploadTray';
import useStore from '../state/useStore';
import folders from '../actions/folders';
import type FilesOverview from '../types/FilesOverview';

const SETTLE = 400;

// Files: shared folders encrypted end to end, at /files and /files/<folder>. It opens with the
// same keys as Docs.
export default function FilesView({ folderId }: { folderId?: string }) {
  const unlocked = useStore((s) => s.docsUnlocked);
  const guest = useStore((s) => s.guest);
  const revision = useStore((s) => s.filesRev);
  // a newly confirmed key is a chance to hand team folders over
  const keysRevision = useStore((s) => s.keysRev);
  const [overview, setOverview] = useState<FilesOverview | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await folders.list();
      setOverview(next);
      setError('');
      // quietly hand team folders to teammates whose keys this person has confirmed since
      folders.shareWithTeam(next.folders).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your folders couldn’t be loaded.');
    }
  }, []);

  useEffect(() => {
    if (!unlocked || guest) return;
    // the first load right away; a burst of changes after it, once
    const soon = setTimeout(() => void refresh(), overview ? SETTLE : 0);
    return () => clearTimeout(soon);
  }, [unlocked, guest, revision, keysRevision, refresh]);

  return (
    <div className="main files-view">
      <ViewHeader title="Files" icon={<Folder size={17} />} subtitle="End-to-end encrypted" />
      {guest ? (
        <EmptyState icon={<FolderLock />} title="Files are for members">
          Guests work inside the projects shared with them. Ask a member to attach what you need to a task.
        </EmptyState>
      ) : !unlocked ? (
        <FilesLocked />
      ) : folderId ? (
        <FolderBrowser folderId={folderId} usage={overview?.usage ?? null} />
      ) : (
        <FolderHome overview={overview} error={error} onRetry={() => void refresh()} />
      )}
      <UploadTray />
    </div>
  );
}
