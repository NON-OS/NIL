import { useEffect, useState } from 'react';
import http from '../../api/http';
import uploadQueue from '../../actions/uploadQueue';
import filesLimits from '../../lib/filesLimits';
import fileSize from '../../lib/fileSize';
import toast from '../../state/toast';

type Unfinished = { id: string; size: number; replaces: string | null };

// Uploads that stopped part way, from a tab that was closed or a browser that went away. They hold
// their full size of this person's file space until the server gives up on them, so they're named
// here with a way to let them go at once.
export default function UnfinishedUploads({ onChanged }: { onChanged: () => void }) {
  const [list, setList] = useState<Unfinished[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    http
      .get<{ uploads: Unfinished[] }>('/blobs')
      .then(({ uploads }) => {
        const mine = uploadQueue.held();
        // fresh copies made while a folder is encrypted again look after themselves
        if (live) setList(uploads.filter((u) => !u.replaces && !mine.has(u.id)));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!list.length) return null;
  const bytes = list.reduce((n, u) => n + u.size, 0);
  const minutes = Math.round(filesLimits().uploadIdleMs / 60_000);
  const discard = async () => {
    setBusy(true);
    try {
      await Promise.all(list.map((u) => http.del(`/blobs/${encodeURIComponent(u.id)}`)));
      setList([]);
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="files-notice" role="status">
      <span>
        {list.length === 1 ? 'An upload that didn’t finish holds' : `${list.length} uploads that didn’t finish hold`} <span className="num">{fileSize(bytes)}</span> of your file space. The server lets {list.length === 1 ? 'it' : 'them'} go by {list.length === 1 ? 'itself' : 'themselves'} after {minutes} minutes untouched.
      </span>
      <button type="button" className="btn btn-sm" onClick={discard} disabled={busy}>
        Discard now
      </button>
    </div>
  );
}
