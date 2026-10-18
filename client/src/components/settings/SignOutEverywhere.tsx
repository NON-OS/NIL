import { useState } from 'react';
import Modal from '../ui/Modal';
import session from '../../actions/session';

// "Sign out on all devices", with the choice to end access keys too: a key made from a session
// someone borrowed would otherwise keep working after every session is gone.
export default function SignOutEverywhere() {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState(true);

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Sign out on all devices
      </button>
      {open && (
        <Modal
          title="Sign out on all devices?"
          onClose={() => setOpen(false)}
          width={460}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => session.signOutEverywhere(keys)}>
                Sign out everywhere
              </button>
            </>
          }
        >
          <div className="modal-body reset-warning">
            <p>Every browser signed in as you is signed out, this one too. Sign in again with your wallet.</p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={keys} onChange={() => setKeys(!keys)} style={{ marginTop: 3 }} />
              <span>Also revoke my access keys, so AI assistants and scripts using them stop working. Do this if someone else may have used your account.</span>
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
