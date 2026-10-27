import '../ui/SharePeople.css';
import { useEffect, useMemo, useState } from 'react';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import keyDirectory from '../../actions/keyDirectory';

interface Props {
  audience: 'team' | 'people';
  picked: Set<string>;
  onAudience: (audience: 'team' | 'people') => void;
  onPicked: (picked: Set<string>) => void;
  // who holds a key now, to say so next to their name
  readers?: string[];
  // who may change between the two, and take people out
  canManage?: boolean;
}

// Who can open a shared folder: the whole team, or the people ticked. People without encryption
// keys yet can't be ticked, the same as for docs.
export default function FolderAudience({ audience, picked, onAudience, onPicked, readers = [], canManage = true }: Props) {
  const me = useStore((s) => s.me)!;
  const userMap = useStore((s) => s.users);
  // folders are encrypted for people; an agent holds no key and could never open one
  const people = useMemo(() => Object.values(userMap).filter((u) => !u.deactivated && u.id !== me.id && u.kind !== 'agent').sort((a, b) => a.name.localeCompare(b.name)), [userMap, me.id]);
  const [withKeys, setWithKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    keyDirectory.load().then((keys) => setWithKeys(new Set([...keys.values()].filter((k) => k.active).map((k) => k.userId)))).catch(() => {});
  }, []);

  const toggle = (id: string) => onPicked(picked.has(id) ? new Set([...picked].filter((x) => x !== id)) : new Set([...picked, id]));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="settings-row" role="radiogroup" aria-label="Who can open it">
        <label className="filter-toggle">
          <input type="radio" name="folder-audience" checked={audience === 'team'} onChange={() => onAudience('team')} disabled={!canManage && audience !== 'team'} /> Whole team
        </label>
        <label className="filter-toggle">
          <input type="radio" name="folder-audience" checked={audience === 'people'} onChange={() => onAudience('people')} disabled={!canManage} /> Specific people
        </label>
      </div>
      {audience === 'people' && (
        <div className="share-people">
          {people.map((p) => (
            <label key={p.id} className="share-person">
              <input type="checkbox" checked={picked.has(p.id)} disabled={!withKeys.has(p.id) || (!canManage && readers.includes(p.id))} onChange={() => toggle(p.id)} />
              <Avatar user={p} size={22} />
              <span>{p.name}</span>
              <small className="muted">{withKeys.has(p.id) ? (readers.includes(p.id) ? 'has access' : '') : 'hasn’t unlocked yet'}</small>
            </label>
          ))}
          {!people.length && <p className="muted">Nobody else is in the workspace yet.</p>}
        </div>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
        {audience === 'team'
          ? 'Everyone in the workspace can open it, add files and change them. People who haven’t unlocked yet get its key the next time a teammate who confirmed their keys opens Files.'
          : 'Only the people you tick can open it, add files and change them.'}
      </p>
    </div>
  );
}
