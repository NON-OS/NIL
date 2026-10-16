import { useSyncExternalStore } from 'react';
import wallets from '../lib/wallets';

// The wallets in this browser, the one picked on this device, and whether discovery has settled.
export default function useWallets() {
  const list = useSyncExternalStore(wallets.subscribe, wallets.list);
  const chosenId = useSyncExternalStore(wallets.subscribe, wallets.chosenId);
  const settled = useSyncExternalStore(wallets.subscribe, wallets.settled);
  return { list, chosen: list.find((w) => w.id === chosenId) ?? null, settled };
}
