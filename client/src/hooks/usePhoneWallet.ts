import { useSyncExternalStore } from 'react';
import phoneWallet from '../lib/phone/phoneWallet';

// Where connecting a phone wallet has got to, and whether this server and device offer it.
export default function usePhoneWallet() {
  const state = useSyncExternalStore(phoneWallet.subscribe, phoneWallet.get);
  return { ...state, enabled: phoneWallet.enabled() };
}
