import './OfflineBanner.css';
import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import useOnline from '../../hooks/useOnline';
import http from '../../api/http';
import unreachable from '../../lib/unreachable';

// How long the live connection may be down before Nil checks whether the server answers at
// all: long enough for the first connection after a load, or a quick reconnect, not to flash the
// banner. While it does answer, it's asked again less often.
const GRACE_MS = 4000;
const RECHECK_MS = 15_000;

// Some networks block the live connection but let ordinary requests through, so its being down
// isn't proof on its own that the server can't be reached. Any answer from Nil counts.
async function serverAnswers() {
  try {
    await http.get('/auth/state');
    return true;
  } catch (err) {
    return !unreachable(err);
  }
}

// Says so while Nil can't reach its server, above the page you're on rather than in place of it.
// The live region is always there, so screen readers hear the words when they appear.
export default function OfflineBanner() {
  const online = useOnline();
  const connected = useStore((s) => s.connected);
  const [late, setLate] = useState(false);
  const down = !online || late;
  const wasDown = useRef(false);

  useEffect(() => {
    if (connected) {
      setLate(false);
      return;
    }
    let live = true;
    let id = 0;
    const check = async () => {
      const answers = await serverAnswers();
      if (!live) return;
      setLate(!answers);
      id = window.setTimeout(check, answers ? RECHECK_MS : GRACE_MS);
    };
    id = window.setTimeout(check, GRACE_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [connected]);

  useEffect(() => {
    if (wasDown.current && !down) toast.show('Back online.', { tone: 'success' });
    wasDown.current = down;
  }, [down]);

  return (
    <div role="status">
      {down && (
        <p className="offline-banner">
          <WifiOff aria-hidden="true" />
          {online ? 'Can’t reach the server. Nil keeps trying, and changes won’t save until it’s back.' : 'You’re offline. Nil reconnects by itself, and changes won’t save until then.'}
        </p>
      )}
    </div>
  );
}
