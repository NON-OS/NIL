import { WifiOff } from 'lucide-react';
import BrandArt from '../components/brand/BrandArt';
import useStore from '../state/useStore';
import useOnline from '../hooks/useOnline';
import useTicker from '../hooks/useTicker';
import offline from '../actions/offline';

// Shown when Nil can't reach its server as it starts, instead of a sign-in screen that would
// suggest you'd been signed out. The address stays as it was, so once the server answers you're
// back on the page you opened.
export default function OfflineView() {
  const retryAt = useStore((s) => s.offlineRetryAt);
  const online = useOnline();
  const now = useTicker(retryAt !== null);
  const seconds = retryAt ? Math.max(1, Math.ceil((retryAt - now) / 1000)) : 0;

  return (
    <main className="recovery">
      <BrandArt kind="mark" height={36} />
      <WifiOff size={22} className="muted" aria-hidden="true" />
      <h1>{online ? 'Can’t reach Nil right now' : 'You’re offline'}</h1>
      <p>{online ? 'The server may be restarting.' : 'Check your connection.'} Nil keeps trying, and opens this page again as soon as it can.</p>
      <p className="muted">{retryAt ? `Trying again in ${seconds} s.` : 'Trying again…'}</p>
      <button type="button" className="btn btn-primary" onClick={offline.tryNow} disabled={retryAt === null}>
        Try now
      </button>
    </main>
  );
}
