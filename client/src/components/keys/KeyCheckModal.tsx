import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import KeyRow from './KeyRow';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import keyDirectory from '../../actions/keyDirectory';
import confirmKeys from '../../actions/confirmKeys';
import type MemberKey from '../../types/MemberKey';

// Asks this person to check teammates' new or changed keys before anything is shared with them.
// Each key is confirmed on its own; "Confirm all" appears only when every key is new, never for
// a changed one.
export default function KeyCheckModal() {
  const check = useStore((s) => s.keyCheck)!;
  const users = useStore((s) => s.users);
  const revision = useStore((s) => s.keysRev);
  const ids = check.userIds.join(',');
  const [keys, setKeys] = useState<MemberKey[] | null>(null);

  useEffect(() => {
    keyDirectory.pending(ids.split(',')).then(setKeys).catch((err) => {
      toast.error(err);
      confirmKeys.done(false);
    });
  }, [ids, revision]);

  useEffect(() => {
    if (keys && !keys.length) confirmKeys.done(true);
  }, [keys]);

  const confirm = (ids: string[]) => keyDirectory.confirm(ids).catch(toast.error);
  const allNew = Boolean(keys?.length) && keys!.every((k) => k.state === 'new');

  return (
    <Modal
      title="Check their keys"
      onClose={() => confirmKeys.done(false)}
      width={560}
      footer={
        <>
          <button type="button" className="btn" onClick={() => confirmKeys.done(false)}>
            Not now
          </button>
          {allNew && keys!.length > 1 && (
            <button type="button" className="btn btn-primary" onClick={() => confirm(keys!.map((k) => k.userId))}>
              Confirm all
            </button>
          )}
        </>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0 }}>
          Before Nil shares {check.reason} with them, make sure these keys are theirs. Ask each person to read out the fingerprint in their Settings, under Sign-in & security, and compare it with the one here, face to face or on a call.
        </p>
        {keys?.some((k) => k.state === 'changed') && (
          <p className="key-warn">A changed key is normal after someone resets their keys or restores them on a new wallet. It is also what a tampered server would show, so confirm only once you’ve checked with them.</p>
        )}
        {!keys ? (
          <Spinner size={18} />
        ) : (
          <div>
            {keys.map((k) => (
              <KeyRow
                key={k.userId}
                entry={k}
                user={users[k.userId]}
                action={
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => confirm([k.userId])} aria-label={`Confirm the key for ${users[k.userId]?.name ?? 'this person'}`}>
                    Confirm
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
