import { Component, type ReactNode } from 'react';
import BrandArt from '../brand/BrandArt';
import Spinner from '../ui/Spinner';
import reloader from '../../lib/reloader';

// How browsers (and React, for a lazy screen whose import came back empty) word a file from an
// older deploy that can't be fetched any more.
const STALE_FILE = /dynamically imported module|importing a module script failed|module script|unable to preload css|result of a dynamic import/i;

interface State {
  failed: boolean;
  reloading: boolean;
}

// The last line of defence. An error no screen handled replaces the app with a plain way back
// in instead of a blank page; nothing about it leaves the browser. A screen that failed to load
// because a deploy removed its files reloads the tab once instead.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, reloading: reloader.started() };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true, reloading: reloader.started() };
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!this.state.reloading && STALE_FILE.test(message) && reloader.once()) this.setState({ reloading: true });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.reloading) {
      return (
        <div className="loading-screen">
          <Spinner size={18} />
        </div>
      );
    }
    return (
      <div className="recovery" role="alert">
        <BrandArt kind="mark" height={36} />
        <h1>Something went wrong</h1>
        <p>Nil ran into a problem it couldn’t get past. Reload to carry on; anything already saved is safe.</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          Reload Nil
        </button>
      </div>
    );
  }
}
