import liveSession from './liveSession';
import pairingOutcome from './pairingOutcome';
import peerName from './peerName';
import phoneProtocol from './phoneProtocol';
import type PhoneClient from '../../types/PhoneClient';
import type PhoneConfig from '../../types/PhoneConfig';
import type PhoneProvider from '../../types/PhoneProvider';
import type PhoneRequest from '../../types/PhoneRequest';
import type PhoneSession from '../../types/PhoneSession';
import type PhoneState from '../../types/PhoneState';
import type createPhoneProvider from './createPhoneProvider';

interface Loaded {
  client: PhoneClient;
  // closes the relay connection and stops the client for good
  shutdown: () => Promise<void>;
  // createPhoneProvider, loaded with the client rather than with the app
  createProvider: typeof createPhoneProvider;
}

interface Deps {
  config: () => PhoneConfig | null;
  // starts WalletConnect's client for connection `id`, which keeps its records under that id
  load: (config: PhoneConfig, id: string) => Promise<Loaded>;
  saved: { current(): string | null; remember(id: string): void; forgetAll(): void };
  // the phone wallet joins this browser's wallets once confirmed, and leaves when it goes
  publish: (wallet: { name: string; provider: PhoneProvider } | null) => void;
  watch?: (request: PhoneRequest) => () => void;
  newId: () => string;
  timeoutMs?: number;
  goodbyeMs?: number;
}

const IDLE: PhoneState = { status: 'idle', uri: null, until: null, wallet: null, confirmed: false, message: null, asking: false };
const withTimeout = (work: Promise<unknown>, ms: number) => Promise.race([work, new Promise((resolve) => setTimeout(resolve, ms))]);

// Connecting a phone wallet: show a code, wait for the phone, show who it is, and once the person
// confirms, put it among this browser's wallets. A confirmed connection comes back after a reload;
// disconnecting or signing out tells the phone and forgets every key WalletConnect kept.
export default function makePhoneWallet(deps: Deps) {
  let state = IDLE;
  let link: (Loaded & { id: string }) | null = null;
  let provider: PhoneProvider | null = null;
  let topic: string | null = null;
  // bumped by every new start, cancel or disconnect, so a slower one that was overtaken stops
  let attempt = 0;
  let offers: ((p: PhoneProvider | null) => void)[] = [];
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PhoneState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  function answerOffers(p: PhoneProvider | null) {
    const waiting = offers;
    offers = [];
    waiting.forEach((resolve) => resolve(p));
  }

  async function drop(goodbye: boolean) {
    const was = link;
    const sessionTopic = topic;
    provider?.close();
    provider = null;
    topic = null;
    link = null;
    deps.publish(null);
    if (was) {
      if (goodbye && sessionTopic) await withTimeout(was.client.disconnect({ topic: sessionTopic, reason: { code: 6000, message: 'User disconnected.' } }).catch(() => {}), deps.goodbyeMs ?? phoneProtocol.goodbyeMs);
      await was.shutdown().catch(() => {});
    }
    deps.saved.forgetAll();
  }

  function wire({ client, createProvider }: Loaded, session: PhoneSession, config: PhoneConfig) {
    topic = session.topic;
    provider = createProvider({ client, topic, chainId: config.chainId, timeoutMs: deps.timeoutMs, watch: deps.watch, onEnd: () => void ended() });
    const address = provider.address();
    if (!address) throw new Error('no account');
    return { name: peerName(session.peer?.metadata), address, chainId: provider.chainId() };
  }

  async function ended() {
    const was = state.confirmed;
    attempt++;
    await drop(false);
    set({ ...IDLE, asking: state.asking, message: was ? 'Your phone wallet disconnected from Nil.' : null });
  }

  const phoneWallet = {
    get: () => state,
    enabled: () => deps.config() !== null,
    provider: () => (state.confirmed ? provider : null),

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // Shows a new code. Whatever connection there was goes first.
    async start() {
      const config = deps.config();
      if (!config) return;
      const mine = ++attempt;
      const asking = state.asking;
      await drop(true);
      if (mine !== attempt) return;
      set({ ...IDLE, asking, status: 'starting' });
      try {
        const id = deps.newId();
        const loaded = await deps.load(config, id);
        if (mine !== attempt) return void loaded.shutdown().catch(() => {});
        link = { id, ...loaded };
        const { uri, approval } = await link.client.connect({ optionalNamespaces: { eip155: { chains: [`eip155:${config.chainId}`], methods: phoneProtocol.remote, events: phoneProtocol.events } } });
        if (mine !== attempt) return;
        if (!uri) throw new Error('no code');
        set({ status: 'waiting', uri, until: Date.now() + phoneProtocol.pairingSeconds * 1000 });
        const session = await approval();
        if (mine !== attempt) return;
        set({ status: 'connected', uri: null, until: null, wallet: wire(link, session, config) });
      } catch (err) {
        if (mine !== attempt) return;
        await drop(Boolean(topic));
        set({ ...IDLE, asking: state.asking, ...pairingOutcome(err) });
      }
    },

    // The person saw the wallet's name and address and chose to go on with it.
    confirm() {
      if (state.status !== 'connected' || state.confirmed || !provider || !link) return;
      deps.saved.remember(link.id);
      set({ confirmed: true, asking: false });
      deps.publish({ name: state.wallet!.name, provider });
      answerOffers(provider);
    },

    // Closes the code, or a connection nobody confirmed yet. A confirmed wallet stays.
    async dismiss() {
      if (!state.confirmed) {
        attempt++;
        await drop(Boolean(topic));
        set({ ...IDLE });
      } else set({ asking: false });
      answerOffers(state.confirmed ? provider : null);
    },

    async disconnect() {
      attempt++;
      await drop(true);
      set({ ...IDLE });
      answerOffers(null);
    },

    // On sign-out: a phone wallet connected in an earlier page load is picked up first, so the
    // phone hears about it too.
    async end() {
      if (!link && deps.saved.current()) await phoneWallet.restore();
      await phoneWallet.disconnect();
    },

    // After a reload, carries on with the phone wallet the person confirmed before.
    async restore() {
      const config = deps.config();
      const id = deps.saved.current();
      if (link) return;
      // records of a connection nobody confirmed are of no use to anyone
      if (!config || !id) return deps.saved.forgetAll();
      const mine = ++attempt;
      try {
        const loaded = await deps.load(config, id);
        if (mine !== attempt) return void loaded.shutdown().catch(() => {});
        link = { id, ...loaded };
        const session = liveSession(link.client.session.getAll());
        if (!session) throw new Error('no session');
        set({ ...IDLE, status: 'connected', wallet: wire(link, session, config), confirmed: true });
        deps.publish({ name: state.wallet!.name, provider: provider! });
      } catch {
        if (mine !== attempt) return;
        await drop(false);
        set({ ...IDLE });
      }
    },

    // Something needs a wallet and this browser has none: offer the phone. Resolves with it once
    // the person connected and confirmed one, or with null if they close the offer.
    offer(): Promise<PhoneProvider | null> {
      if (!deps.config()) return Promise.resolve(null);
      if (state.confirmed && provider) return Promise.resolve(provider);
      set({ asking: true });
      return new Promise((resolve) => offers.push(resolve));
    },
  };
  return phoneWallet;
}
