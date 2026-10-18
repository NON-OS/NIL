import './Keys.css';
import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import useStore from '../../state/useStore';
import cx from '../../lib/cx';
import keyDirectory from '../../actions/keyDirectory';
import confirmKeys from '../../actions/confirmKeys';
import type MemberKey from '../../types/MemberKey';

// Tells this person when someone new shows up with a key, or someone's key changes, so they see
// it happen. Nothing is shared with such a key until they've checked it.
export default function KeyNotice({ reason }: { reason: string }) {
  const users = useStore((s) => s.users);
  const revision = useStore((s) => s.keysRev);
  const [pending, setPending] = useState<MemberKey[]>([]);

  useEffect(() => {
    keyDirectory.pending().then(setPending).catch(() => setPending([]));
  }, [revision]);

  if (!pending.length) return null;
  const changed = pending.filter((k) => k.state === 'changed');
  const names = (list: MemberKey[]) => {
    const all = list.map((k) => users[k.userId]?.name ?? 'someone not in this workspace');
    return all.length > 3 ? `${all.slice(0, 3).join(', ')} and ${all.length - 3} more` : all.join(', ');
  };

  return (
    <div className={cx('key-notice', changed.length > 0 && 'changed')} role="status">
      <ShieldAlert size={14} />
      <span>
        {changed.length
          ? `Key changed for ${names(changed)}. Nothing new is shared with them until you check the new key.`
          : `${pending.length === 1 ? 'New key' : 'New keys'} for ${names(pending)}. Compare fingerprints and confirm before ${reason} can be shared with them.`}
      </span>
      <button type="button" className="btn btn-sm" onClick={() => confirmKeys.show(pending.map((k) => k.userId), reason)}>
        Check keys
      </button>
    </div>
  );
}
