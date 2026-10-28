// A top-level shared folder as the browser sees it after decrypting and checking its name.
export default interface SharedFolder {
  id: string;
  name: string;
  version: number;
  // which of the folder's keys this is, as signed with its name where the name says
  keyRev: number;
  // items with an own key from before this folder key wait to be encrypted again
  resealRev: number;
  // who whoever named this version signed it for
  audience: 'team' | 'people';
  readers: string[];
  createdBy: string | null;
  // who signed the name
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
  // 'unverified': no signature of the folder's creator or an admin checks out on the name, so it
  // may be the server's or another reader's. 'rollback': older than a version or key this browser
  // already opened. Either way nothing is written under its key.
  warning: 'unverified' | 'rollback' | null;
  // the fingerprint of an earlier key of the signer's, when that's the key that signed
  oldKey: string | null;
  // the hash of the folder key this version opened with, so nothing is written under another
  keyHash: string;
  // the signed name says every item's details are bound to this folder key
  bound: boolean;
}
