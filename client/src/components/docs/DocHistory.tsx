import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import docs from '../../actions/docs';
import dates from '../../lib/dates';
import type DocItem from '../../types/DocItem';

type Revision = Awaited<ReturnType<typeof docs.revisions>>[number];

// Earlier versions, decrypted here. Restoring one saves it as the newest version.
export default function DocHistory({ doc, onClose, onRestore }: { doc: DocItem; onClose: () => void; onRestore: (title: string, body: string) => void }) {
  const users = useStore((s) => s.users);
  const [list, setList] = useState<Revision[] | null>(null);

  useEffect(() => {
    docs.revisions(doc).then(setList).catch((err) => {
      toast.error(err);
      setList([]);
    });
  }, [doc]);

  return (
    <Modal title="Version history" onClose={onClose} width={620}>
      <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
        {!list ? (
          <Spinner size={18} />
        ) : list.length === 0 ? (
          <p className="muted">No earlier versions yet. Each save keeps the previous one, up to 25.</p>
        ) : (
          list.map((r) => (
            <div key={r.version} className="revision">
              <div className="settings-row" style={{ justifyContent: 'space-between' }}>
                <strong>
                  <span className="mono muted">v{r.version}</span> {r.title}
                </strong>
                <button type="button" className="btn btn-sm" onClick={() => (onRestore(r.title, r.body), onClose())}>
                  Restore
                </button>
              </div>
              <small className="muted">
                {r.updatedBy ? users[r.updatedBy]?.name ?? 'A former member' : 'Someone'} · {dates.dateTime(r.createdAt)}
              </small>
              <pre>{r.body.slice(0, 600)}</pre>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
