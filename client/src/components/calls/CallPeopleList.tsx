import { useEffect, useMemo, useState } from 'react';
import { Phone, Search, Video } from 'lucide-react';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import keyDirectory from '../../actions/keyDirectory';
import startCall from '../../actions/calls/startCall';
import type MemberKey from '../../types/MemberKey';
import type User from '../../types/User';

const STATE: Record<string, string> = { confirmed: 'Key confirmed', new: 'Key not confirmed yet', changed: 'Key changed: check it first', none: 'Can’t be called until they unlock Nil' };

// The team, online first, each a tap away from a call. Someone with no keys can't be called:
// there's nothing to check their connection against.
export default function CallPeopleList({ busy }: { busy: boolean }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  const keysRev = useStore((s) => s.keysRev);
  const presence = useStore((s) => s.presence);
  const [keys, setKeys] = useState<Map<string, MemberKey> | null>(null);
  const [query, setQuery] = useState('');
  const online = useMemo(() => new Set(presence.map((p) => p.userId)), [presence]);
  const people = useMemo(() => Object.values(users).filter((u) => u.kind !== 'agent' && !u.deactivated && u.role !== 'guest' && u.id !== me), [users, me]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((u) => !q || u.name.toLowerCase().includes(q) || (u.title ?? '').toLowerCase().includes(q)).sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name));
  }, [people, query, online]);

  useEffect(() => {
    keyDirectory.load().then(setKeys, () => setKeys(new Map()));
  }, [keysRev]);

  const row = (u: User) => {
    const state = keys ? keys.get(u.id)?.state ?? 'none' : null;
    const here = online.has(u.id);
    const off = busy || state === 'none';
    return (
      <li key={u.id} className="call-person">
        <Avatar user={u} size={36} online={here} />
        <div className="call-person-text">
          <span className="call-person-name">{u.name}</span>
          <span className="call-person-sub">{[here ? 'Online' : null, state ? STATE[state] : u.title].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" className="icon-btn call-person-btn" disabled={off} onClick={() => void startCall({ with: [u.id] })} aria-label={`Call ${u.name}`} title={`Call ${u.name}`}>
          <Phone />
        </button>
        <button type="button" className="icon-btn call-person-btn" disabled={off} onClick={() => void startCall({ with: [u.id] }, { video: true })} aria-label={`Video call ${u.name}`} title={`Video call ${u.name}`}>
          <Video />
        </button>
      </li>
    );
  };

  if (!people.length) return <p className="call-panel-empty">Nobody else is on the team yet. Invite someone from Settings, under Team, and you can call them here.</p>;
  return (
    <>
      {people.length > 6 && (
        <label className="call-search">
          <Search aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find someone" aria-label="Find someone to call" />
        </label>
      )}
      {shown.length ? <ul className="call-people">{shown.map(row)}</ul> : <p className="call-panel-empty">Nobody on the team matches “{query}”.</p>}
    </>
  );
}
