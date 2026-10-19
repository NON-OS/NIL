// The parts of a WalletConnect session Nil reads: its topic, when it expires (in seconds), what
// the phone approved, and the phone wallet's own description of itself.
export default interface PhoneSession {
  topic: string;
  expiry: number;
  namespaces: Record<string, { accounts: string[]; methods: string[]; events?: string[]; chains?: string[] }>;
  peer: { metadata?: unknown };
}
