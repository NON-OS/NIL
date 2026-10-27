// A live change to a doc after it's decrypted and its signature checked.
export default interface OpenedUpdate {
  id: string;
  update: Uint8Array;
  by: string;
  verified: boolean;
}
