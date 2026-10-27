import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type DocItem from './DocItem';
import type LiveStatus from './LiveStatus';

// A doc open for live editing (see createLiveDoc).
export default interface LiveDoc {
  ydoc: Y.Doc;
  awareness: Awareness;
  current(): DocItem;
  status(): LiveStatus;
  onStatus(fn: (s: LiveStatus) => void): () => void;
  // lay a newer saved version on top
  rebase(fresh: DocItem): Promise<void>;
  // changes this tab hasn't got onto the server yet
  pending(): boolean;
  reconnected(): void;
  close(): Promise<void>;
}
