import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import anonymousVotes from '../../actions/anonymousVotes';

// For a member who hasn't registered a voting key yet. Joining and voting are separate clicks on
// purpose, so the key (sent signed in) and the ballot (sent anonymously) never arrive together.
export default function JoinVote({ onJoined }: { onJoined: () => void }) {
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    try {
      await anonymousVotes.join();
      toast.show('You joined anonymous votes. Vote whenever you’re ready.', { tone: 'success' });
      onJoined();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="proposal-options">
      <button type="button" className="btn btn-primary" disabled={busy} onClick={join}>
        {busy ? <Spinner size={13} /> : <UserPlus />} Join anonymous votes
      </button>
    </div>
  );
}
