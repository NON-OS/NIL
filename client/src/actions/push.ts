import http from '../api/http';
import store from '../state/store';
import storage from '../lib/storage';
import dates from '../lib/dates';
import b64u from '../lib/crypto/b64u';
import type PushState from '../types/PushState';

type Support = 'ready' | 'insecure' | 'install' | 'unsupported' | 'blocked';

interface ServerInfo {
  enabled: boolean;
  publicKey: string | null;
  devices: number;
}

// Push is opted into per person on each browser, so someone else signing in here never
// inherits it.
const flag = () => `push:${store.get().me?.id ?? ''}`;

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

// A subscription made for an older server key can't receive anything any more.
function madeFor(subscription: PushSubscription, publicKey: string) {
  const key = subscription.options.applicationServerKey;
  return Boolean(key) && b64u.encode(new Uint8Array(key!)) === publicKey;
}

async function subscription(publicKey: string, { create }: { create: boolean }) {
  const reg = await registration();
  if (!reg) return null;
  let current = await reg.pushManager.getSubscription();
  if (current && !madeFor(current, publicKey)) {
    await current.unsubscribe().catch(() => false);
    current = null;
  }
  if (!current && create) current = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u.decode(publicKey) });
  return current;
}

function save(sub: PushSubscription, extra: { showNames?: boolean } = {}) {
  return http.put<PushState>('/push/subscription', { endpoint: sub.endpoint, keys: sub.toJSON().keys, timeZone: dates.zone(), ...extra });
}

const push = {
  // Whether this browser can take push notifications, and if not, which reason to explain.
  support(): Support {
    if (!window.isSecureContext) return 'insecure';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
      // iPhone and iPad offer push only to web apps added to the Home Screen
      const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      return apple ? 'install' : 'unsupported';
    }
    return Notification.permission === 'denied' ? 'blocked' : 'ready';
  },

  isOnHere: () => storage.get(flag(), false),

  info: () => http.get<ServerInfo>('/push'),

  async enable(): Promise<PushState> {
    const info = await push.info();
    if (!info.enabled || !info.publicKey) throw new Error('Push notifications are turned off on this server.');
    if (!(await registration())) throw new Error('Push needs the app’s service worker, which isn’t running yet. Reload Nil and try again.');
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser’s site settings.');
    const sub = await subscription(info.publicKey, { create: true });
    if (!sub) throw new Error('This browser didn’t give Nil a push subscription.');
    const state = await save(sub);
    storage.set(flag(), true);
    return state;
  },

  async disable() {
    storage.set(flag(), false);
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await http.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => false);
  },

  // Sends this device's subscription again when the app opens. That ties it to the current
  // session after signing in again, follows a server key change, and keeps the time zone
  // used for morning notes current.
  async refresh(): Promise<PushState | null> {
    if (!push.isOnHere() || push.support() !== 'ready' || Notification.permission !== 'granted') return null;
    const info = await push.info();
    if (!info.enabled || !info.publicKey) return null;
    const sub = await subscription(info.publicKey, { create: true });
    if (!sub) {
      storage.set(flag(), false);
      return null;
    }
    return save(sub);
  },

  async setShowNames(showNames: boolean) {
    const sub = await (await registration())?.pushManager.getSubscription();
    if (!sub) throw new Error('Turn push notifications on for this device first.');
    return http.patch<PushState>('/push/subscription', { endpoint: sub.endpoint, showNames });
  },

  async test() {
    const sub = await (await registration())?.pushManager.getSubscription();
    if (!sub) throw new Error('Turn push notifications on for this device first.');
    await http.post('/push/test', { endpoint: sub.endpoint });
  },

  // For a lost phone or a shared computer: every device stops getting notifications.
  async offEverywhere() {
    const state = await http.del<PushState>('/push/subscriptions');
    await push.disable();
    return state;
  },
};

export default push;
