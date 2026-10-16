// A doc exactly as the server stores and returns it: ciphertext plus your sealed key.
export default interface EncryptedDoc {
  id: string;
  titleCt: string;
  bodyCt?: string;
  version: number;
  audience: 'team' | 'people';
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
  wrappedKey: string;
  readers: string[];
}
