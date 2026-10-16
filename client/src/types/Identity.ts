// A member's unlocked identity, held only in memory. Everything comes from the random seed.
export default interface Identity {
  seed: Uint8Array;
  // X25519: teammates seal doc keys, task keys and vote shares to the public half
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  // Ed25519: signs what this member writes in docs and private tasks
  signingPrivate: Uint8Array;
  signingKey: Uint8Array;
}
