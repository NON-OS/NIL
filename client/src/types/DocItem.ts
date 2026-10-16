// A doc as the browser sees it after decrypting. Bodies load only when a doc is opened.
export default interface DocItem {
  id: string;
  title: string;
  body: string | null;
  version: number;
  audience: 'team' | 'people';
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
  readers: string[];
  // 'unverified': no teammate's signature checks out on this version, so it may be the server's
  // own text. 'rollback': older than a version this browser already opened.
  warning: 'unverified' | 'rollback' | null;
}
