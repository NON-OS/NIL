import type { RosterFacts } from '../lib/crypto/chatRoster';

// One epoch's member list, checked: signed by `by`, who was allowed to start it.
export default interface ChatRoster extends RosterFacts {
  epoch: number;
  by: string;
  // the hash the next list names as its `prev`
  hash: string;
  // this person's own sealed copies of the epoch's key, from whoever gave them one
  wrappedKeys: string[];
  // who it left out on the strength of their signed departure rather than a manager's say
  departed: string[];
}
