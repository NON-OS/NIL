import { useMemo, useState } from 'react';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import fuzzyScore from '../../lib/fuzzyScore';
import chatChannels from '../../actions/chat/chatChannels';

interface Props {
  chosen: string[];
  onChange: (ids: string[]) => void;
  // one person only, for a direct message
  single?: boolean;
  label: string;
}

// Teammates to pick for a conversation: active people on the team, never guests or agents.
export default function PeoplePicker({ chosen, onChange, single = false, label }: Props) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  const [query, setQuery] = useState('');
  const people = useMemo(
    () =>
      chatChannels
        .teammates()
        .filter((id) => id !== me)
        .map((id) => users[id])
        .filter((u) => !query.trim() || fuzzyScore(u.name, query) > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users, me, query],
  );
  const toggle = (id: string) => onChange(single ? [id] : chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="chat-legend">{label}</legend>
      <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find someone" aria-label="Find someone" />
      <div className="chat-people">
        {people.map((u) => (
          <label key={u.id} className="chat-person">
            <input type={single ? 'radio' : 'checkbox'} name="chat-people" checked={chosen.includes(u.id)} onChange={() => toggle(u.id)} />
            <Avatar user={u} size={24} />
            <span className="grow">{u.name}</span>
            {u.title && <small>{u.title}</small>}
          </label>
        ))}
        {!people.length && <p className="muted">Nobody matches.</p>}
      </div>
    </fieldset>
  );
}
