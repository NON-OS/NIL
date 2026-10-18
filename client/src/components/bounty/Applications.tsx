import { useCallback, useEffect, useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import toast from '../../state/toast';
import http from '../../api/http';
import putTask from '../../state/putTask';
import dates from '../../lib/dates';
import shortAddress from '../../lib/shortAddress';
import type Application from '../../types/Application';
import type Task from '../../types/Task';

const DONE = { accept: 'Accepted. They can sign in with their wallet and see this task.', decline: 'Declined.', delete: 'Deleted.' };

// Outside applicants for a listed bounty. Accepting makes them a guest who sees only this task.
// Deleting leaves nothing behind, for spam; the switch stops new applications coming in.
export default function Applications({ task }: { task: Task }) {
  const [list, setList] = useState<Application[]>([]);
  const refresh = useCallback(() => http.get<Application[]>(`/tasks/${task.id}/applications`).then(setList).catch(() => {}), [task.id]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const decide = async (id: string, action: keyof typeof DONE) => {
    try {
      const res = action === 'delete' ? await http.del<{ task?: Task }>(`/applications/${id}`) : await http.post<{ task?: Task }>(`/applications/${id}/${action}`);
      if (res.task) putTask(res.task);
      toast.show(DONE[action], { tone: 'success' });
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const toggle = async () => {
    try {
      putTask((await http.post<{ task: Task }>(`/tasks/${task.id}/applications/${task.applicationsClosedAt ? 'reopen' : 'close'}`)).task);
    } catch (err) {
      toast.error(err);
    }
  };

  const pending = list.filter((a) => a.status === 'pending');
  return (
    <div className="applications">
      <label className="filter-toggle">
        <button type="button" className="toggle" role="switch" aria-checked={!task.applicationsClosedAt} onClick={toggle} aria-label="Take new applications" />
        Take new applications
      </label>
      {!list.length ? (
        <p>{task.applicationsClosedAt ? 'Listed on the public board, not taking applications.' : 'Listed on the public board. Applications will show up here.'}</p>
      ) : (
        pending.length === 0 && <p>No applications waiting.</p>
      )}
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
            <button type="button" className="btn btn-sm" onClick={() => decide(a.id, 'decline')} aria-label={`Decline ${a.name}`} title="Decline">
              <X />
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => decide(a.id, 'delete')} aria-label={`Delete ${a.name}’s application`} title="Delete, for spam">
              <Trash2 />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
