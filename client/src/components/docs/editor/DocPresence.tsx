import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import AvatarStack from '../../ui/AvatarStack';
import useStore from '../../../state/useStore';
import type User from '../../../types/User';

// Who else has this doc open right now.
export default function DocPresence({ awareness }: { awareness: Awareness }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me)!.id;
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const read = () => {
      const seen = new Set<string>();
      awareness.getStates().forEach((state) => {
        const id = (state as { user?: { id?: unknown } }).user?.id;
        if (typeof id === 'string' && id !== me) seen.add(id);
      });
      setIds([...seen]);
    };
    read();
    awareness.on('change', read);
    return () => awareness.off('change', read);
  }, [awareness, me]);
  const people = ids.map((id) => users[id]).filter((u): u is User => Boolean(u));
  if (!people.length) return null;
  return (
    <span className="doc-presence" aria-label={`Also here: ${people.map((u) => u.name).join(', ')}`} title={people.map((u) => u.name).join(', ')}>
      <AvatarStack users={people} size={22} max={4} />
    </span>
  );
}
