import type PhoneConfig from '../../types/PhoneConfig';

const PROJECT_ID = /^[0-9a-f]{32}$/;
const RELAY = /^wss?:\/\/[^/?#\s]+$/;

let current: PhoneConfig | null = null;

// Whether the server offers phone wallets, from what it answers at start-up. It is read at
// runtime rather than built in, so one web build serves every server.
const phoneConfig = {
  get: () => current,

  set(value: unknown) {
    const v = value as Partial<PhoneConfig> | null;
    const ok = typeof v?.projectId === 'string' && PROJECT_ID.test(v.projectId) && typeof v.relayUrl === 'string' && RELAY.test(v.relayUrl) && Number.isSafeInteger(v.chainId) && Number(v.chainId) > 0;
    current = ok ? { projectId: v!.projectId!, relayUrl: v!.relayUrl!, chainId: Number(v!.chainId) } : null;
  },
};

export default phoneConfig;
