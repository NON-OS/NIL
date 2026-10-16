import { useState } from 'react';
import ConfirmButton from '../ui/ConfirmButton';
import Modal from '../ui/Modal';
import ResetLinkModal from './ResetLinkModal';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import signInResets from '../../actions/signInResets';
import isAdminUser from '../../lib/isAdmin';
import type User from '../../types/User';

// "Reset sign-in" on a member's row, for someone who lost every wallet.
export default function ResetSignInButton({ user }: { user: User }) {
  const users = useStore((s) => s.users);
  const [warning, setWarning] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  // the admins who could approve resetting an owner, counted the same way the server does
  const approvers = Object.values(users).filter((u) => !u.deactivated && isAdminUser(u) && u.id !== user.id).length;
  const owner = user.role === 'owner';

  const start = async (acknowledged = false) => {
    setWarning(false);
    try {
      const { reset, token } = await signInResets.start(user.id, acknowledged);
      if (token) setLink({ url: signInResets.link(token), expiresAt: reset.expiresAt });
      else toast.show('Asked for approval. Another admin can approve it under Sign-in resets.', { tone: 'success', timeout: 6000 });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      {owner && approvers < 2 ? (
        <button type="button" className="btn btn-sm" onClick={() => setWarning(true)}>
          Reset sign-in
        </button>
      ) : (
        <ConfirmButton className="btn btn-sm" onConfirm={() => start()} confirmLabel={owner ? 'Ask a second admin?' : 'Make a reset link?'}>
          Reset sign-in
        </ConfirmButton>
      )}
      {warning && (
        <Modal
          title={`Reset ${user.name}’s sign-in?`}
          onClose={() => setWarning(false)}
          width={460}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setWarning(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => start(true)}>
                Make the link anyway
              </button>
            </>
          }
        >
          <div className="modal-body reset-warning">
            <p>{user.name} is an owner, and there’s no other admin to approve this. Whoever opens the link can sign in as {user.name} and gets full control of the workspace.</p>
            <p>Only go ahead if you’ve spoken with {user.name} by phone or in person and know they lost their wallets.</p>
          </div>
        </Modal>
      )}
      {link && <ResetLinkModal name={user.name} url={link.url} expiresAt={link.expiresAt} onClose={() => setLink(null)} />}
    </>
  );
}
