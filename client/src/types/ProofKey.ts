// What a workspace publishes about the key that signs its proofs, and the block explorer for
// the chain its payments are made on.
export default interface ProofKey {
  configured: boolean;
  name?: string;
  key?: string;
  fingerprint?: string;
  explorer?: { chainId: number; url: string };
}
