import { SignClient } from '@walletconnect/sign-client';
import hardenClient from './hardenClient.js';
import memoryStorage from './memoryStorage.js';
import phoneProvider from './phoneProvider.js';

// The sign-up message only names a network; nothing is ever sent to one
const CHAIN = 1;
const ACCOUNT = /^eip155:(\d{1,12}):(0x[0-9a-fA-F]{40})$/;
// how long a disconnect waits for the relay to tell the phone, before closing anyway
const GOODBYE_MS = 3000;
const GONE = 'Your phone wallet disconnected. Connect it again to carry on.';

const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);

// The account to sign up with: the one on Ethereum if the phone shared it, else its first.
function accountOf(session) {
  const listed = session?.namespaces?.eip155?.accounts;
  const accounts = (Array.isArray(listed) ? listed : []).flatMap((entry) => {
    const match = typeof entry === 'string' ? ACCOUNT.exec(entry) : null;
    return match ? [{ chainId: Number(match[1]), address: match[2] }] : [];
  });
  return accounts.find((a) => a.chainId === CHAIN) ?? accounts[0] ?? null;
}

// The name a phone wallet gives itself, cut to fit a line. It comes from the wallet, so it is only
// ever shown as text, and the icon it names is never loaded.
function peerName(metadata) {
  const name = metadata?.name;
  const clean = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim() : '';
  return clean ? clean.slice(0, 40) : 'Phone wallet';
}

// One phone connection for one sign-up. WalletConnect's client keeps its records in memory only
// and talks to the relay and nothing else: no telemetry, nothing logged, Verify off (see
// hardenClient). It asks the phone for personal_sign alone, hands the page the phone as its
// wallet once it approves, and `close` tells the phone goodbye and shuts the client down.
export default async function connectPhone({ projectId, relayUrl }) {
  const id = newId();
  const client = await SignClient.init({
    projectId,
    relayUrl,
    customStoragePrefix: id,
    storage: memoryStorage(),
    telemetryEnabled: false,
    logger: 'silent',
    // the phone shows these when asked to connect; the icon is fetched by the phone, from this site
    metadata: { name: 'Nil', description: 'Create a hosted Nil workspace with the wallet on your phone.', url: location.origin, icons: [`${location.origin}/assets/favicon.svg`] },
  });
  // a hook for downloading the client's logs, which stay empty with logging off
  delete globalThis.downloadLogsBlobInBrowser;
  let topic = null;
  let wallet = null;
  let closed = false;

  async function close() {
    if (closed) return;
    closed = true;
    wallet?.stop('Cancelled here. If your phone still shows the request, reject it there.');
    if (topic) await Promise.race([client.disconnect({ topic, reason: { code: 6000, message: 'User disconnected.' } }).catch(() => {}), new Promise((resolve) => setTimeout(resolve, GOODBYE_MS))]);
    client.core.heartbeat.stop();
    await client.core.relayer.transportClose().catch(() => {});
    // WalletConnect keeps each core, and a count of them, on the page's global object
    delete globalThis[`_walletConnectCore_${id}`];
    delete globalThis[`_walletConnectCore_${id}_count`];
  }

  try {
    hardenClient(client);
    const { uri, approval } = await client.connect({ optionalNamespaces: { eip155: { chains: [`eip155:${CHAIN}`], methods: ['personal_sign'], events: ['accountsChanged', 'chainChanged'] } } });
    if (!uri) throw new Error('no code');
    client.on('session_delete', ({ topic: t }) => t === topic && wallet?.stop(GONE));
    return {
      uri,
      async approved() {
        const session = await approval();
        topic = session.topic;
        const account = accountOf(session);
        if (!account) throw new Error('no account');
        wallet = phoneProvider({ client, topic, ...account });
        return { name: peerName(session.peer?.metadata), address: account.address, wallet };
      },
      close,
    };
  } catch (err) {
    await close();
    throw err;
  }
}
