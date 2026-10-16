import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/controls.css';
import './styles/layout.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/shell/ErrorBoundary';
import session from './actions/session';
import registerServiceWorker from './lib/registerServiceWorker';
import reloader from './lib/reloader';

// A tab from before a deploy asks for screens whose files are gone. One reload brings the new
// build; if that was just tried, the error reaches the boundary below instead.
window.addEventListener('vite:preloadError', (event) => {
  if (reloader.once()) event.preventDefault();
});

session.boot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
