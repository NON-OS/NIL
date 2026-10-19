import type PhoneSession from './PhoneSession';

// The slice of WalletConnect's sign client that Nil uses, so tests can stand in for it.
export default interface PhoneClient {
  connect(args: { optionalNamespaces: Record<string, { chains: string[]; methods: string[]; events: string[] }> }): Promise<{ uri?: string; approval: () => Promise<PhoneSession> }>;
  request(args: { topic: string; chainId: string; request: { method: string; params?: unknown }; expiry?: number }): Promise<unknown>;
  disconnect(args: { topic: string; reason: { code: number; message: string } }): Promise<void>;
  session: { get(topic: string): PhoneSession; getAll(): PhoneSession[] };
  on(event: string, listener: (args: any) => void): unknown;
  off(event: string, listener: (args: any) => void): unknown;
}
