// What an upload keeps between tries in this tab, so trying again carries on from the chunks the
// server already has: the blob it started, its header, and the SHA-256 of every chunk it sealed,
// to be sure the file reads the same as before any chunk is sealed again under the same nonce.
export default interface BlobCarry {
  blob?: string;
  header?: Uint8Array;
  digests: Uint8Array[];
}
