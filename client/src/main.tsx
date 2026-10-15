import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/controls.css';
import './styles/layout.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import session from './actions/session';
import './hooks/useTheme';
import registerServiceWorker from './lib/registerServiceWorker';

session.boot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
