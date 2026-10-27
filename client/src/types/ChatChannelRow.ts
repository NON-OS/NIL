// A conversation as the server sends it: ciphertext for its name and topic, who is in it, and
// this person's own sealed copies of the keys they need first.
export default interface ChatChannelRow {
  id: string;
  kind: 'channel' | 'dm' | 'group';
  audience: 'team' | 'people';
  createdBy: string | null;
  createdAt: number;
  lastAt: number;
  // the number of the newest message, and of the newest one this person has read
  seq: number;
  readSeq: number;
  unread: number;
  epoch: number;
  epochAt: number | null;
  // when the current epoch is due to be replaced on schedule
  rotateAt: number | null;
  metaCt: string | null;
  metaEpoch: number | null;
  disappearSeconds: number | null;
  members: string[];
  // who holds the current epoch's key
  keyHolders: string[];
  wrappedKey: string | null;
  metaKey: string | null;
  notify: 'default' | 'all' | 'mentions' | 'none';
}
