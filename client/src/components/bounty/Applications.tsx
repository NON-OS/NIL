import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import toast from '../../state/toast';
import http from '../../api/http';
import putTask from '../../state/putTask';
import dates from '../../lib/dates';
import shortAddress from '../../lib/shortAddress';
import type Application from '../../types/Application';
import type Task from '../../types/Task';

// Outside applicants for a listed bounty. Accepting makes them a guest who sees only this task.
export default function Applications({ taskId }: { taskId: string }) {
  const [list, setList] = useState<Application[]>([]);
  const refresh = useCallback(() => http.get<Application[]>(`/tasks/${taskId}/applications`).then(setList).catch(() => {}), [taskId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const decide = async (id: string, action: 'accept' | 'decline') => {
    try {
      const res = await http.post<{ task?: Task }>(`/applications/${id}/${action}`);
      if (res.task) putTask(res.task);
      toast.show(action === 'accept' ? 'Accepted. They can sign in with their wallet and see this task.' : 'Declined.', { tone: 'success' });
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const pending = list.filter((a) => a.status === 'pending');
  if (!list.length) return <p>Listed on the public board. Applications will show up here.</p>;
  return (
    <div className="applications">
      {pending.length === 0 && <p>No applications waiting.</p>}
      {pending.map((a) => (
        <div key={a.id} className="application">
          <div style={{ minWidth: 0 }}>
            <strong>{a.name}</strong> <span className="mono muted" title={a.address}>{shortAddress(a.address)}</span>
            <small className="muted"> · {dates.ago(a.createdAt)}</small>
            {a.pitch && <p>{a.pitch}</p>}
          </div>
          <div className="bounty-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => decide(a.id, 'accept')}>
              <Check /> Accept
            </button>
            <button type="button" className="btn btn-sm" onClick={() => decide(a.id, 'decline')} aria-label={`Decline ${a.name}`}>
              <X />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
