import { useEffect, useState } from 'react';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import keyDirectory from '../../actions/keyDirectory';

// Three members who will hold the vote's decryption key together: any two can reveal the
// totals after it closes, none alone can see anything. They need an encryption key (docs).
export default function TrusteePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const users = useStore((s) => s.users);
  const [withKeys, setWithKeys] = useState<Set<string> | null>(null);

  useEffect(() => {
    keyDirectory.load().then((keys) => setWithKeys(new Set([...keys.values()].filter((k) => k.active).map((k) => k.userId)))).catch(toast.error);
  }, []);

  const people = Object.values(users).filter((u) => !u.deactivated && u.role !== 'guest');
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : value.length < 3 ? [...value, id] : value);

  return (
    <div className="field">
      <span>Trustees ({value.length} of 3)</span>
      <div className="share-people">
        {people.map((p) => {
          const ready = withKeys?.has(p.id) ?? false;
          return (
            <label key={p.id} className="share-person">
              <input type="checkbox" checked={value.includes(p.id)} disabled={!ready || (!value.includes(p.id) && value.length >= 3)} onChange={() => toggle(p.id)} />
              <Avatar user={p} size={22} />
              <span>{p.name}</span>
              {!ready && <small className="muted">hasn’t unlocked encrypted docs yet</small>}
            </label>
          );
        })}
      </div>
      <small>Any two trustees decrypt the totals after the vote closes. Two of them together could also open single ballots, so pick people who won’t collude.</small>
    </div>
  );
}
