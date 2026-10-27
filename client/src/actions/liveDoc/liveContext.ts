import type * as Y from 'yjs';
import type DocItem from '../../types/DocItem';
import type LiveStatus from '../../types/LiveStatus';

// What the parts of one live doc share: the state, the key, the newest version this tab holds,
// how far into the server's numbered changes that state reaches, and the changes this tab sent.
export default interface LiveContext {
  ydoc: Y.Doc;
  docId: string;
  key: Uint8Array;
  doc: DocItem;
  through: number;
  sent: Set<string>;
  status: LiveStatus;
  setStatus(patch: Partial<LiveStatus>): void;
  // a local change was made
  local(): void;
  // every change this tab made is on the server now
  settled(): void;
  // save a new version now, folding in the live changes
  saveNow(): Promise<void>;
  // fetch the newest version and lay it on top
  reload(): Promise<void>;
}
