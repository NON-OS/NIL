import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Picker from '../ui/Picker';
import toast from '../../state/toast';
import shareLinks from '../../actions/shareLinks';
import dates from '../../lib/dates';
import type ShareLink from '../../types/ShareLink';

const EXPIRY = [7, 30, 90].map((d) => ({ value: String(d), label: `Expires in ${d} days` }));

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.show('Link copied.', { tone: 'success' });
  } catch {
    toast.show('Couldn’t reach the clipboard. Select the link and copy it.', { tone: 'error' });
  }
}

// A secret, read-only link for someone outside the workspace (a client, an investor). It shows
// titles and status only: no people, comments, files or private tasks.
export default function ShareLinkModal({ kind, targetId, name, onClose }: { kind: ShareLink['kind']; targetId: string; name: string; onClose: () => void }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [days, setDays] = useState('30');
  const [fresh, setFresh] = useState<string | null>(null);

  const refresh = useCallback(() => shareLinks.list(kind, targetId).then(setLinks).catch(toast.error), [kind, targetId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    try {
      const { token } = await shareLinks.create(kind, targetId, Number(days));
      const url = `${location.origin}/s/${token}`;
      setFresh(url);
      copy(url);
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Modal title={`Share “${name}” read-only`} onClose={onClose} width={560}>
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          Anyone with the link can see {kind === 'project' ? 'this project’s task titles and status' : 'this task’s title, status, description and checklist progress'}, without signing in. No names, comments, files or private tasks. Search engines are told not to index it.
        </p>
        <div className="settings-row">
          <Picker title="Expiry" options={EXPIRY} value={days} onChange={setDays} className="btn" width={200}>
            {EXPIRY.find((o) => o.value === days)?.label}
          </Picker>
          <button type="button" className="btn btn-primary" onClick={create}>
            <Link2 /> Create link
          </button>
        </div>
        {fresh && (
          <div className="invite-link">
            <input className="input" readOnly value={fresh} onFocus={(e) => e.target.select()} aria-label="Share link" />
            <button type="button" className="btn" onClick={() => copy(fresh)}>
              <Copy /> Copy
            </button>
          </div>
        )}
        {links.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Active links</div>
            {links.map((l) => (
              <div key={l.id} className="member" style={{ gridTemplateColumns: '20px minmax(0, 1fr) auto' }}>
                <Link2 size={15} />
                <div className="member-sub">
                  Created {dates.short(dates.toISO(new Date(l.createdAt)))}
                  {l.expiresAt ? ` · expires ${dates.short(dates.toISO(new Date(l.expiresAt)))}` : ''} · {l.views} view{l.views === 1 ? '' : 's'}
                </div>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => shareLinks.revoke(l.id).then(refresh).catch(toast.error)}>
                  <Trash2 /> Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
