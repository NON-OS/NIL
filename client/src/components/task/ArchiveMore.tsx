import './ArchiveMore.css';
import { useState } from 'react';
import { History } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import archive from '../../actions/archive';
import dates from '../../lib/dates';
import cursorTime from '../../lib/cursorTime';

// Under a list that shows finished work: older finished tasks stay on the server until asked.
export default function ArchiveMore() {
  const cursor = useStore((s) => s.archive.cursor);
  const [busy, setBusy] = useState(false);
  if (!cursor) return null;

  const load = async () => {
    setBusy(true);
    try {
      await archive.more();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="archive-more">
      <span>Finished tasks from before {dates.short(dates.toISO(new Date(cursorTime(cursor))))} aren’t loaded yet.</span>
      <button type="button" className="btn btn-sm" onClick={load} disabled={busy}>
        {busy ? <Spinner size={13} /> : <History />} Load older
      </button>
    </div>
  );
}
