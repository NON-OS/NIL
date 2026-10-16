import config from '../config.js';
import publicWorkspace from '../services/publicWorkspace.js';

// Who the browser thinks it's talking to. Wallet sign-in messages are bound to this domain, so it
// comes from configuration only: APP_URL, or another configured origin the request arrived on
// (an onion address next to the HTTPS one). A phishing site can set Host and Origin to anything,
// but it can't add itself to that list.
export default function relyingParty(req) {
  const asked = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/$/, '') : null;
  const url = new URL(config.allowedOrigins.find((o) => o === asked) ?? config.appUrl);
  return { origin: url.origin, host: url.host, rpID: url.hostname, name: publicWorkspace()?.name ?? 'Nil' };
}
