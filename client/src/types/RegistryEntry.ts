// What your wallet has in the public ERC-6538 registry, read back through the Nil server.
export default interface RegistryEntry {
  wallet: string;
  state: 'found' | 'none' | 'invalid';
  metaAddress: string | null;
}
