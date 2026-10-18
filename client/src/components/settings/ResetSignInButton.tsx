import { useState } from 'react';
import ConfirmButton from '../ui/ConfirmButton';
import Modal from '../ui/Modal';
import ResetLinkModal from './ResetLinkModal';
import toast from '../../state/toast';
import signInResets from '../../actions/signInResets';
import ApiError from '../../api/ApiError';
import dates from '../../lib/dates';
import type User from '../../types/User';

// "Reset sign-in" on a member's row, for someone who lost every wallet. For an owner the server
// decides: a second admin approves, or with nobody to approve, the reset waits a few days first.
export default function ResetSignInButton({ user }: { user: User }) {
  const [warning, setWarning] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const owner = user.role === 'owner';

  const start = async (acknowledged = false) => {
    setWarning(null);
    try {
      const { reset, token } = await signInResets.start(user.id, acknowledged);
      if (token) setLink({ url: signInResets.link(token), expiresAt: reset.expiresAt });
      else if (reset.readyAt) toast.show(`Asked. ${user.name} and the other admins have been told. You can make the link from ${dates.dateTime(reset.readyAt)} under Sign-in resets, unless someone cancels.`, { tone: 'success', timeout: 8000 });
      else toast.show('Asked for approval. Another admin can approve it under Sign-in resets.', { tone: 'success', timeout: 6000 });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setWarning(err.message);
      else toast.error(err);
    }
  };

  return (
    <>
      <ConfirmButton className="btn btn-sm" onConfirm={() => start()} confirmLabel={owner ? 'Reset an owner?' : 'Make a reset link?'}>
        Reset sign-in
      </ConfirmButton>
      {warning && (
        <Modal
          title={`Reset ${user.name}’s sign-in?`}
          onClose={() => setWarning(null)}
          width={460}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setWarning(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => start(true)}>
                Ask anyway
              </button>
            </>
          }
        >
          <div className="modal-body reset-warning">
            <p>{warning}</p>
            <p>Whoever opens the link can sign in as {user.name} and gets full control of the workspace. Only go ahead if you’ve spoken with {user.name} by phone or in person and know they lost their wallets.</p>
          </div>
        </Modal>
      )}
      {link && <ResetLinkModal name={user.name} url={link.url} expiresAt={link.expiresAt} onClose={() => setLink(null)} />}
    </>
  );
}
