// Phone wallets on the sign-up page: someone on a computer without a wallet scans a code with the
// wallet app on their phone and signs there, through WalletConnect's relay. The same settings
// and rules as a workspace's (server/config/walletConnect.js), except that a value which is set
// but wrong stops the start, like every other mistake in cloud.env. The project ID is public:
// every browser that uses it sends it to the relay.
const RELAY = 'wss://relay.walletconnect.org';
const PROJECT_ID = /^[0-9a-f]{32}$/;
// a plain ws:// relay only on this machine, for tests
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function relayOrigin(value) {
  try {
    const url = new URL(value);
    const secure = url.protocol === 'wss:' || (url.protocol === 'ws:' && LOCAL_HOSTS.has(url.hostname));
    if (secure && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch {}
  return null;
}

export default function readWalletConnect(read) {
  const projectId = read.text('WALLETCONNECT_PROJECT_ID');
  const relay = read.text('WALLETCONNECT_RELAY_URL');
  if (!projectId) {
    if (relay) read.warn('WALLETCONNECT_RELAY_URL is set but WALLETCONNECT_PROJECT_ID isn’t, so the sign-up page offers no phone wallets.');
    return null;
  }
  if (!PROJECT_ID.test(projectId)) {
    read.fail('WALLETCONNECT_PROJECT_ID isn’t a WalletConnect project ID (32 lowercase hexadecimal characters). Copy it from the Reown dashboard, or leave it empty.');
    return null;
  }
  const relayUrl = relay ? relayOrigin(relay) : RELAY;
  if (!relayUrl) {
    read.fail('WALLETCONNECT_RELAY_URL must be a wss:// address with no path, or empty for WalletConnect’s own relay.');
    return null;
  }
  return Object.freeze({ projectId, relayUrl });
}
