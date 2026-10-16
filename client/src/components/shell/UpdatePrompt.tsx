import './UpdatePrompt.css';
import { RefreshCw, X } from 'lucide-react';
import useStore from '../../state/useStore';
import store from '../../state/store';

// Offered when the server hands out a newer build than this tab runs. Nothing is lost by
// waiting: the tab keeps working, and reloads on its own if it needs a file the deploy removed.
export default function UpdatePrompt() {
  const ready = useStore((s) => s.updateReady);
  if (!ready) return null;
  return (
    <div className="update-prompt" role="status">
      <RefreshCw className="update-icon" aria-hidden="true" />
      <span className="update-message">A new version of Nil is ready.</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => location.reload()}>
        Reload
      </button>
      <button type="button" className="update-later" onClick={() => store.set({ updateReady: false })} aria-label="Not now" title="Not now">
        <X />
      </button>
    </div>
  );
}
