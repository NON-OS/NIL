import { useEffect, useState } from 'react';
import KeyRow from '../keys/KeyRow';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import keyDirectory from '../../actions/keyDirectory';
import type MemberKey from '../../types/MemberKey';

// Every key the server lists as this browser sees it, deactivated members' included. Nothing is
// shared with a key until it's confirmed here or in the prompt that appears when it's needed.
export default function TeamKeysCard() {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  const revision = useStore((s) => s.keysRev);
  const [keys, setKeys] = useState<MemberKey[] | null>(null);

  useEffect(() => {
    keyDirectory
      .load()
      .then((all) => setKeys([...all.values()].filter((k) => k.userId !== me).sort((a, b) => (users[a.userId]?.name ?? '').localeCompare(users[b.userId]?.name ?? ''))))
      .catch((err) => {
        toast.error(err);
        setKeys([]);
      });
  }, [revision, me, users]);

  if (!keys) return <Spinner size={18} />;
  return (
    <div className="settings-card" style={{ paddingBlock: 6 }}>
      {keys.length === 0 ? (
        <p className="muted" style={{ margin: '10px 0' }}>No teammate has set up encryption yet.</p>
      ) : (
        keys.map((k) => (
          <KeyRow
            key={k.userId}
            entry={k}
            user={users[k.userId]}
            action={
              k.state !== 'confirmed' && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => keyDirectory.confirm([k]).catch(toast.error)} aria-label={`Confirm the key for ${users[k.userId]?.name ?? 'this person'}`}>
                  Confirm
                </button>
              )
            }
          />
        ))
      )}
    </div>
  );
}
