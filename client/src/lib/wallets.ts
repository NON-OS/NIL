import storage from './storage';
import type Eip1193Provider from '../types/Eip1193Provider';
import type WalletOption from '../types/WalletOption';

interface Announcement {
  info?: { uuid?: unknown; name?: unknown; icon?: unknown; rdns?: unknown };
  provider?: Eip1193Provider;
}

type Injected = Eip1193Provider & Record<string, unknown>;

const CHOICE = 'wallet';
// Extensions announce within a few milliseconds; this only decides when "no wallet" is believable.
const SETTLE_MS = 600;
const MAX_ICON_LENGTH = 256 * 1024;
// Icons are drawn with <img>, where an SVG can't run script. Only data: images are accepted,
// so showing a wallet's icon never fetches anything.
const ICON = /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i;

const announced = new Map<string, WalletOption>();
const listeners = new Set<() => void>();
let snapshot: WalletOption[] = [];
// a wallet app on the person's phone, connected over WalletConnect and confirmed
let phone: WalletOption | null = null;
let settled = false;
let started = false;

// Older wallets, and some wallet apps' built-in browsers, only set window.ethereum.
function injected(): WalletOption | null {
  const p = (window as unknown as { ethereum?: Injected }).ethereum;
  if (!p || typeof p.request !== 'function') return null;
  const name = p.isRabby ? 'Rabby' : p.isCoinbaseWallet ? 'Coinbase Wallet' : p.isBraveWallet ? 'Brave Wallet' : p.isMetaMask ? 'MetaMask' : 'Browser wallet';
  return { id: 'injected', name, icon: null, provider: p };
}

function refresh() {
  // window.ethereum is usually one of the announced wallets again, so it only counts when none announce
  const fallback = injected();
  const found = announced.size ? [...announced.values()] : fallback ? [fallback] : [];
  snapshot = phone ? [...found, phone] : found;
  listeners.forEach((listener) => listener());
}

function onAnnounce(event: Event) {
  const { info, provider } = ((event as CustomEvent).detail ?? {}) as Announcement;
  if (!info || typeof provider?.request !== 'function') return;
  const id = typeof info.rdns === 'string' && info.rdns ? info.rdns : typeof info.uuid === 'string' ? info.uuid : '';
  if (!id) return;
  const name = typeof info.name === 'string' && info.name.trim() ? info.name.trim().slice(0, 40) : 'Browser wallet';
  const icon = typeof info.icon === 'string' && info.icon.length <= MAX_ICON_LENGTH && ICON.test(info.icon) ? info.icon : null;
  announced.set(id, { id, name, icon, provider });
  refresh();
}

function start() {
  if (started) return;
  started = true;
  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  refresh();
  setTimeout(() => {
    settled = true;
    refresh();
  }, SETTLE_MS);
}

// Every wallet in this browser (EIP-6963), and which one this device signs in with. The choice
// is kept in local storage as the wallet's name only: no address, nothing about the account.
const wallets = {
  subscribe(listener: () => void) {
    start();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  list(): WalletOption[] {
    start();
    return snapshot;
  },

  // Asks again, for a wallet that was unlocked or injected after the page loaded.
  rescan() {
    start();
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    refresh();
  },

  // Before this, an empty list may only mean the wallets haven't spoken yet.
  settled: () => settled,

  chosenId: () => storage.get<string | null>(CHOICE, null),

  choose(id: string) {
    storage.set(CHOICE, id);
    refresh();
  },

  // The phone wallet joins the list once the person confirms it, and leaves when it disconnects,
  // taking the choice with it so the next wallet button asks again.
  setPhone(option: WalletOption | null) {
    if (!option && phone && wallets.chosenId() === phone.id) storage.set(CHOICE, null);
    phone = option;
    refresh();
  },

  // The wallet to talk to: the one picked on this device, the only one, or whichever owns window.ethereum.
  active(): WalletOption | null {
    const all = wallets.list();
    const chosen = all.find((w) => w.id === wallets.chosenId());
    return chosen ?? (all.length === 1 ? all[0] : null) ?? injected() ?? all[0] ?? null;
  },
};

export default wallets;
