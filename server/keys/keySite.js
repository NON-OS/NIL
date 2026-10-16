import config from '../config.js';

// Key statements and unlock messages name one site, the address in APP_URL, whichever address the
// browser came in on. A key published over the onion address has to check out for someone on the
// HTTPS one, and the keys a wallet signature unlocks mustn't change with the address bar.
export default function keySite() {
  const url = new URL(config.appUrl);
  return { origin: url.origin, host: url.host };
}
