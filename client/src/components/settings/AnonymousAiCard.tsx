import { useEffect, useState } from 'react';
import http from '../../api/http';
import store from '../../state/store';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import isAdminUser from '../../lib/isAdmin';
import unlockPrivateKeys from '../../actions/unlockPrivateKeys';
import registerVotingKey from '../../actions/registerVotingKey';
import Spinner from '../ui/Spinner';
import AiMode from '../ai/AiMode';

interface Usage {
  on: boolean;
  days: { day: string; requests: number }[];
}

// How built-in AI requests leave this workspace, and for admins the switch and the only record
// of anonymous use there is: a count per day.
export default function AnonymousAiCard() {
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const on = useStore((s) => s.aiAnonymous);
  const me = useStore((s) => s.me);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const needsKey = on && me?.role !== 'guest' && !me?.semaphoreCommitment;

  useEffect(() => {
    if (isAdmin) http.get<Usage>('/ai-credits/usage').then(setUsage).catch(toast.error);
  }, [isAdmin, on]);

  const toggle = async () => {
    try {
      const { on: next } = await http.put<{ on: boolean }>('/ai-credits', { anonymous: !on });
      store.set({ aiAnonymous: next });
      toast.show(next ? 'Members with a voting key now send AI requests anonymously.' : 'AI requests are sent signed in again.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  };

  // Registers the voting key, the public half of your anonymous identity. A click of its own, well
  // before any request, so the key and the first anonymous request don't arrive together.
  const setUp = async () => {
    setBusy(true);
    try {
      await registerVotingKey(await unlockPrivateKeys());
      toast.show('Anonymous requests are set up.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-card" style={{ display: 'grid', gap: 12 }}>
      {isAdmin && (
        <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
          <span>
            <strong>Anonymous AI requests</strong>
            <br />
            <span className="muted">Members with a voting key prove they belong to the workspace without saying who they are, and each gets a set number of requests a day. Members without a key, and guests, send requests signed in. The server keeps no link between a request and who sent it, and admins see only a count per day.</span>
          </span>
          <button type="button" className="toggle" role="switch" aria-checked={on} onClick={toggle} aria-label="Anonymous AI requests" />
        </label>
      )}
      <AiMode pointer={false} />
      {needsKey && (
        <div>
          <button type="button" className="btn" onClick={setUp} disabled={busy}>
            {busy && <Spinner size={13} />} Set up anonymous requests
          </button>
          <p className="hint" style={{ marginTop: 6 }}>Your wallet signs to unlock your keys, and only the public half of your voting key goes to the server. Joining anonymous votes sets up the same key. Do it a while before you use AI, so the two don’t arrive together.</p>
        </div>
      )}
      {isAdmin && usage && usage.days.length > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          Anonymous requests: {usage.days.slice(0, 7).map((d) => `${d.day}: ${d.requests}`).join(', ')}.
        </p>
      )}
    </div>
  );
}
