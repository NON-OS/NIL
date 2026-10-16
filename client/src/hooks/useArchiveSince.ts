import { useEffect } from 'react';
import useStore from '../state/useStore';
import toast from '../state/toast';
import archive from '../actions/archive';

// For a view that looks back over a period: loads every closed task touched since `time` from
// the archive, and says whether some are still on the way.
export default function useArchiveSince(time: number) {
  // the cursor moves back with every page that arrives
  const cursor = useStore((s) => s.archive.cursor);
  const loading = cursor !== null && !archive.covers(time);
  useEffect(() => {
    if (loading) archive.since(time).catch(toast.error);
  }, [loading, time]);
  return loading;
}
