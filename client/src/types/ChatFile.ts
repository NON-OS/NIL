// A file in a message. Its key, name and type travel only inside the encrypted, signed message;
// the server holds the encrypted bytes under `id`.
export default interface ChatFile {
  id: string;
  name: string;
  type: string;
  // the size and SHA-256 of the bytes before encryption
  size: number;
  hash: string;
  key: string;
}
