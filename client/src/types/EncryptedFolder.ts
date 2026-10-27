// A shared folder exactly as the server stores and returns it: its encrypted name, your sealed
// copy of its key and who else holds one.
export default interface EncryptedFolder {
  id: string;
  nameCt: string;
  version: number;
  // counts the folder's keys: one more each time someone is taken out
  keyRev: number;
  audience: 'team' | 'people';
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
  wrappedKey: string;
  readers: string[];
}
