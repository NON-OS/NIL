// A stand-in for WalletConnect's sign client, holding one session a phone approved. `answer`
// decides what the phone says to each request; by default it signs or sends with made-up values.
// Every request sent to the phone is kept in `sent`, and `emit` plays an event from the phone.
export const ADDRESS = '0x1111111111111111111111111111111111111111';
export const OTHER = '0x2222222222222222222222222222222222222222';
export const METHODS = ['personal_sign', 'eth_sendTransaction', 'wallet_switchEthereumChain'];

export function phoneSession({ topic = 'topic-1', accounts = [`eip155:1:${ADDRESS}`], methods = METHODS, expiry = Math.floor(Date.now() / 1000) + 7 * 86400, name = 'Test Wallet' } = {}) {
  return { topic, expiry, namespaces: { eip155: { accounts, methods, events: ['accountsChanged', 'chainChanged'] } }, peer: { metadata: { name, url: 'https://wallet.example', icons: ['https://wallet.example/icon.png'] } } };
}

export default function phoneClient({ sessions = [phoneSession()], approval } = {}) {
  const listeners = new Map();
  const store = new Map(sessions.map((s) => [s.topic, s]));
  const client = {
    sent: [],
    disconnected: [],
    answer: async ({ request }) => (request.method === 'personal_sign' ? `0x${'ab'.repeat(65)}` : request.method === 'eth_sendTransaction' ? `0x${'cd'.repeat(32)}` : null),
    emit(event, args) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(args);
    },
    listening: (event) => listeners.get(event)?.size ?? 0,
    async connect(args) {
      client.proposed = args;
      return { uri: 'wc:pairing@2?relay-protocol=irn&symKey=secret', approval: approval ?? (async () => [...store.values()][0]) };
    },
    async request(args) {
      client.sent.push(args);
      return client.answer(args);
    },
    async disconnect({ topic, reason }) {
      client.disconnected.push({ topic, reason });
      store.delete(topic);
    },
    session: {
      get(topic) {
        if (!store.has(topic)) throw new Error(`No matching key. session: ${topic}`);
        return store.get(topic);
      },
      getAll: () => [...store.values()],
      set: (session) => store.set(session.topic, session),
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
  };
  return client;
}
