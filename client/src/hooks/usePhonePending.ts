import { useSyncExternalStore } from 'react';
import phonePending from '../lib/phone/phonePending';

// Requests waiting for a tap on the phone.
export default function usePhonePending() {
  return useSyncExternalStore(phonePending.subscribe, phonePending.get);
}
