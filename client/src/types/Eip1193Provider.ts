// What every browser wallet exposes (EIP-1193): one request method.
export default interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<any>;
}
