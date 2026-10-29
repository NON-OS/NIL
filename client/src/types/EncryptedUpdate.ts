// A live change to a doc as the server keeps and sends it.
export default interface EncryptedUpdate {
  seq: number;
  // missing when the server only announced it, being too big to send along; it's fetched instead
  updateCt?: string;
  by: string | null;
  at: number;
}
