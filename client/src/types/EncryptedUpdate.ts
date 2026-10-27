// A live change to a doc as the server keeps and sends it.
export default interface EncryptedUpdate {
  seq: number;
  updateCt: string;
  by: string | null;
  at: number;
}
