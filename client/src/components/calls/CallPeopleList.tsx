import { useEffect, useMemo, useState } from 'react';
import { Phone, Video } from 'lucide-react';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import keyDirectory from '../../actions/keyDirectory';
import startCall from '../../actions/calls/startCall';
import type MemberKey from '../../types/MemberKey';

const STATE: Record<string, string> = { confirmed: 'Key confirmed', new: 'Key not confirmed yet', changed: 'Key changed: check it before you talk', none: 'No encryption keys yet' };

// The team, each with a call button. Someone with no keys can't be called: there's nothing to
// check their connection against.
export default function CallPeopleList({ busy }: { busy: boolean }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  const keysRev = useStore((s) => s.keysRev);
  const [keys, setKeys] = useState<Map<string, MemberKey> | null>(null);
  const people = useMemo(() => Object.values(users).filter((u) => u.kind !== 'agent' && !u.deactivated && u.role !== 'guest' && u.id !== me).sort((a, b) => a.name.localeCompare(b.name)), [users, me]);

  useEffect(() => {
    keyDirectory.load().then(setKeys, () => setKeys(new Map()));
  }, [keysRev]);

  if (!people.length) return <p className="muted">Nobody else is on the team yet. Invite someone from Settings, under Team.</p>;
  return (
    <ul className="call-people">
      {people.map((u) => {
        const state = keys ? keys.get(u.id)?.state ?? 'none' : null;
        return (
          <li key={u.id} className="member">
            <Avatar user={u} size={32} />
            <div style={{ minWidth: 0 }}>
              <div className="member-name">{u.name}</div>
              <div className="member-sub">{state ? STATE[state] : u.title}</div>
            </div>
            <div className="settings-row">
              <button type="button" className="btn btn-sm" disabled={busy || state === 'none'} onClick={() => void startCall({ with: [u.id] })} aria-label={`Call ${u.name}`}>
                <Phone /> Call
              </button>
              <button type="button" className="btn btn-sm" disabled={busy || state === 'none'} onClick={() => void startCall({ with: [u.id] }, { video: true })} aria-label={`Video call ${u.name}`}>
                <Video /> Video
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
