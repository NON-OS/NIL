import type BlobCarry from './BlobCarry';

// What one file's upload into a shared folder keeps between tries in this tab: the key it's
// encrypted under and how far its contents got (see BlobCarry). Its thumbnail and chunk list are
// small and simply sent again.
export default interface UploadCarry {
  key?: Uint8Array;
  main: BlobCarry;
}
