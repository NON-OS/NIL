import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import keyDirectory from '../../actions/keyDirectory';
import docs from '../../actions/docs';
import type DocItem from '../../types/DocItem';

interface Props {
  doc: DocItem;
  canManage: boolean;
  onClose: () => void;
  onDone: () => void;
}

// Adding people seals the doc key for them. Removing people re-keys the whole doc.
export default function ShareDocModal({ doc, canManage, onClose, onDone }: Props) {
  const me = useStore((s) => s.me)!;
  const userMap = useStore((s) => s.users);
  // docs are encrypted for people; an agent holds no key and could never open one
  const people = useMemo(() => Object.values(userMap).filter((u) => !u.deactivated && u.id !== me.id && u.kind !== 'agent').sort((a, b) => a.name.localeCompare(b.name)), [userMap, me.id]);
  const [audience, setAudience] = useState(doc.audience);
  const [picked, setPicked] = useState(new Set(doc.readers.filter((id) => id !== me.id)));
  const [withKeys, setWithKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    keyDirectory.load().then((keys) => setWithKeys(new Set([...keys.values()].filter((k) => k.active).map((k) => k.userId)))).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const target = audience === 'team' ? people.map((p) => p.id) : [...picked];
      // a version that failed its check is only kept by moving it to a fresh key, signed by you
      const removing = doc.warning === 'unverified' || doc.readers.some((id) => id !== me.id && !target.includes(id)) || audience !== doc.audience;
      if (removing) {
        if (!canManage) throw new Error('Only the doc’s creator or an admin can remove people.');
        await docs.restrict(doc, target, audience);
        toast.show('Done. The doc has a new key, so removed people can’t read new versions.', { tone: 'success' });
      } else {
        await docs.share(doc, target);
        toast.show('Shared. Their browsers can now decrypt this doc.', { tone: 'success' });
      }
      onDone();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Who can read this doc"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <Spinner size={14} />} Save
          </button>
        </>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        <div className="settings-row" role="radiogroup" aria-label="Audience">
          <label className="filter-toggle">
            <input type="radio" name="audience" checked={audience === 'team'} onChange={() => setAudience('team')} disabled={!canManage && doc.audience !== 'team'} /> Whole team
          </label>
          <label className="filter-toggle">
            <input type="radio" name="audience" checked={audience === 'people'} onChange={() => setAudience('people')} disabled={!canManage} /> Specific people
          </label>
        </div>
        {audience === 'people' && (
          <div className="share-people">
            {people.map((p) => (
              <label key={p.id} className="share-person">
                <input type="checkbox" checked={picked.has(p.id)} disabled={!withKeys.has(p.id)} onChange={() => setPicked((s) => (s.has(p.id) ? new Set([...s].filter((x) => x !== p.id)) : new Set([...s, p.id])))} />
                <Avatar user={p} size={22} />
                <span>{p.name}</span>
                <small className="muted">{withKeys.has(p.id) ? (doc.readers.includes(p.id) ? 'has access' : '') : 'hasn’t unlocked docs yet'}</small>
              </label>
            ))}
          </div>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          {audience === 'team' ? 'Everyone in the workspace can read and edit it. People who haven’t unlocked docs yet get the key the next time a teammate who has confirmed their keys opens Docs.' : 'Only the people you tick can read and edit it.'}
        </p>
      </div>
    </Modal>
  );
}
