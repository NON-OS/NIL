import { useEffect, useMemo, useState } from 'react';
import { Check, Phone, Search, Video } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import useCallStore from '../../state/useCallStore';
import keyDirectory from '../../actions/keyDirectory';
import startCall from '../../actions/calls/startCall';
import cx from '../../lib/cx';
import type MemberKey from '../../types/MemberKey';

// Picks who to call, one person or several, and starts the call with sound or with video.
// Everyone picked is rung at once; the call holds as many as the server allows.
export default function NewCallDialog({ onClose }: { onClose: () => void }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  const presence = useStore((s) => s.presence);
  const max = useCallStore((s) => s.settings?.maxPeers ?? 6);
  const [keys, setKeys] = useState<Map<string, MemberKey> | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const online = useMemo(() => new Set(presence.map((p) => p.userId)), [presence]);
  const room = max - 1;

  useEffect(() => {
    keyDirectory.load().then(setKeys, () => setKeys(new Map()));
  }, []);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(users)
      .filter((u) => u.kind !== 'agent' && !u.deactivated && u.role !== 'guest' && u.id !== me && (!q || u.name.toLowerCase().includes(q)))
      .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name));
  }, [users, me, query, online]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < room ? [...p, id] : p));
  const start = (video: boolean) => {
    onClose();
    void startCall({ with: picked }, { video });
  };
  const who = picked.map((id) => users[id]?.name ?? 'Someone');

  return (
    <Modal
      title="New call"
      onClose={onClose}
      width={480}
      footer={
        <>
          <span className="call-new-count muted">{picked.length ? `${picked.length} of up to ${room}` : `Pick up to ${room}`}</span>
          <button type="button" className="btn" onClick={() => start(false)} disabled={!picked.length}>
            <Phone /> Call
          </button>
          <button type="button" className="btn btn-primary" onClick={() => start(true)} disabled={!picked.length}>
            <Video /> Video call
          </button>
        </>
      }
    >
      <div className="modal-body call-new">
        <label className="call-search">
          <Search aria-hidden="true" />
          <input type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find someone" aria-label="Find someone to call" />
        </label>
        <p className="call-new-who" aria-live="polite">
          {who.length ? `You’ll call ${who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who[0]}.` : 'Pick who to call. Pick more than one for a group call.'}
        </p>
        <ul className="call-new-list" aria-label="People to call">
          {people.map((u) => {
            const on = picked.includes(u.id);
            const noKeys = keys !== null && !keys.get(u.id);
            const full = !on && picked.length >= room;
            return (
              <li key={u.id}>
                <button type="button" className={cx('call-new-person', on && 'on')} aria-pressed={on} disabled={noKeys || full} onClick={() => toggle(u.id)}>
                  <Avatar user={u} size={32} online={online.has(u.id)} />
                  <span className="call-person-text">
                    <span className="call-person-name">{u.name}</span>
                    <span className="call-person-sub">{noKeys ? 'Can’t be called until they unlock Nil' : online.has(u.id) ? 'Online' : u.title || 'Away'}</span>
                  </span>
                  <span className="call-new-check" aria-hidden="true">
                    {on && <Check />}
                  </span>
                </button>
              </li>
            );
          })}
          {!people.length && <li className="call-panel-empty">Nobody on the team matches “{query}”.</li>}
        </ul>
      </div>
    </Modal>
  );
}
