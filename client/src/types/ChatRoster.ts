import type { RosterFacts } from '../lib/crypto/chatRoster';

// One epoch's member list, checked: signed by `by`, who was allowed to start it.
export default interface ChatRoster extends RosterFacts {
  epoch: number;
  by: string;
  // the hash the next list names as its `prev`
  hash: string;
  wrappedKey: string | null;
}
