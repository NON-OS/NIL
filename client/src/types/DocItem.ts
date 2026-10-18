// A doc as the browser sees it after decrypting. Bodies load only when a doc is opened.
export default interface DocItem {
  id: string;
  title: string;
  body: string | null;
  version: number;
  // from format 2 on, who the person who saved this version signed it for; the server's word
  // for a version in the older format
  audience: 'team' | 'people';
  createdBy: string | null;
  // who saved this version: from format 2 on, whoever signed it
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
  readers: string[];
  // 'unverified': no teammate's signature checks out on this version, so it may be the server's
  // own text. 'rollback': older than a version this browser already opened.
  warning: 'unverified' | 'rollback' | null;
  // saved in the older format, which can't show who the doc is for
  olderFormat: boolean;
  // the fingerprint of an earlier key of the writer's, when that's the key that signed this version
  oldKey: string | null;
  // the hash of the doc key this version was opened with, so nothing is written under another one
  keyHash: string;
}
