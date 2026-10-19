import configWarning from '../lib/configWarning.js';

// Phone wallets over WalletConnect: someone on a computer without a wallet scans a code with the
// wallet app on their phone and approves each signature there. The browser and the phone swap
// end-to-end encrypted messages through WalletConnect's relay, which is the only other host the
// page may then reach. The project ID comes from WalletConnect's dashboard and is public: every
// browser sends it to the relay. Empty keeps the feature off, and the relay out of the
// Content-Security-Policy.
const RELAY = 'wss://relay.walletconnect.org';
const PROJECT_ID = /^[0-9a-f]{32}$/;
// a plain ws:// relay only on this machine, for tests and the accessibility check
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function projectId(value) {
  if (!value) return null;
  if (PROJECT_ID.test(value)) return value;
  configWarning('WALLETCONNECT_PROJECT_ID isn’t a WalletConnect project ID (32 lowercase hexadecimal characters). Phone wallets stay off.');
  return null;
}

function relayUrl(value) {
  if (!value) return RELAY;
  try {
    const url = new URL(value);
    const secure = url.protocol === 'wss:' || (url.protocol === 'ws:' && LOCAL_HOSTS.has(url.hostname));
    if (secure && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch {}
  configWarning(`WALLETCONNECT_RELAY_URL must be a wss:// address with no path. Using ${RELAY}.`);
  return RELAY;
}

const env = process.env;
const id = projectId((env.WALLETCONNECT_PROJECT_ID ?? '').trim());

export default Object.freeze({
  enabled: id !== null,
  projectId: id,
  relayUrl: relayUrl((env.WALLETCONNECT_RELAY_URL ?? '').trim()),
});
