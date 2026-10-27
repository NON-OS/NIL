import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import factChecks from './factChecks';
import b64u from './b64u';

export interface RosterFacts {
  kind: 'channel' | 'dm' | 'group';
  audience: 'team' | 'people';
  // who holds this epoch's key, and who of them may manage the conversation, both sorted
  members: string[];
  managers: string[];
  // the hash of the epoch's key (see keyHash), and of the signed list before this one
  key: string;
  prev: string | null;
  at: number;
}

const sorted = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every(factChecks.person) && v.every((id, i) => i === 0 || v[i - 1] < id);

// The member list of one epoch of a conversation, which whoever starts the epoch signs. Each
// list names the hash of the one before, so a reader who checked the first can check every list
// after it, and tell who changed who is in the conversation.
const chatRoster = {
  kind: 'nil/chat-roster/v1',
  place: (workspaceKey: string, channelId: string, epoch: number) => [workspaceKey, channelId, epoch],
  list: (f: RosterFacts) => [f.kind, f.audience, f.members, f.managers, f.key, f.prev, f.at],
  people: (ids: string[]) => [...new Set(ids)].sort(),
  // names a signed list for the next one to point back to
  hash: (raw: string) => b64u.encode(sha256(concatBytes(utf8ToBytes('nil/chat-roster-hash/v1'), utf8ToBytes(raw)))),

  parse(list: unknown[]): RosterFacts {
    const [kind, audience, members, managers, key, prev, at] = list;
    const fits =
      list.length === 7 &&
      (kind === 'channel' || kind === 'dm' || kind === 'group') &&
      (audience === 'team' || audience === 'people') &&
      sorted(members, 5000) &&
      sorted(managers, 5000) &&
      managers.every((id) => members.includes(id)) &&
      factChecks.hash(key) &&
      (prev === null || factChecks.hash(prev)) &&
      factChecks.time(at);
    if (!fits) throw new Error('This member list carries details Nil doesn’t accept.');
    return { kind, audience, members, managers, key, prev, at } as RosterFacts;
  },
};

export default chatRoster;
