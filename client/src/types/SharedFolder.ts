// A top-level shared folder as the browser sees it after decrypting and checking its name.
export default interface SharedFolder {
  id: string;
  name: string;
  version: number;
  keyRev: number;
  // who whoever named this version signed it for
  audience: 'team' | 'people';
  readers: string[];
  createdBy: string | null;
  // who signed the name
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
  // 'unverified': no teammate's signature checks out on the name, so it may be the server's.
  // 'rollback': older than a version this browser already opened.
  warning: 'unverified' | 'rollback' | null;
  // the fingerprint of an earlier key of the signer's, when that's the key that signed
  oldKey: string | null;
  // the hash of the folder key this version opened with, so nothing is written under another
  keyHash: string;
}
