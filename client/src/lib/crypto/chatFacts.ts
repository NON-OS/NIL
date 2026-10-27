import factChecks from './factChecks';
import type { ChatPlace } from './chatText';

export type ChatEntry = 'message' | 'reaction' | 'deleted';

export interface ChatFacts {
  type: ChatEntry;
  // 0 when sent, one more with each edit; a deletion is the last edit
  edit: number;
  at: number;
  // the sending tab's own stream of messages in this conversation, and this one's number in it
  stream: string;
  n: number;
  // the thread it belongs to, or null on the main timeline
  thread: string | null;
  // seconds until it disappears, as the conversation was set when it was sent, or null
  ttl: number | null;
  // the hash of the epoch key it was encrypted under (see keyHash)
  key: string;
}

const ID = /^[A-Za-z0-9_-]{22}$/;
const STREAM = /^[A-Za-z0-9_-]{16}$/;

// What the sender signs with every message, reaction, edit and deletion. Its place is the
// workspace, conversation, epoch, message id, sender and time, the same as the additional data.
// The stream and number let a reader tell when the server held a message back, sent one twice or
// changed their order; the edit number, when it shows an older edit.
const chatFacts = {
  kind: 'nil/chat-message/v1',
  place: ({ workspaceKey, channelId, epoch, message }: ChatPlace) => [workspaceKey, channelId, epoch, message?.id, message?.senderId, message?.sentAt],
  list: (f: ChatFacts) => [f.type, f.edit, f.at, f.stream, f.n, f.thread, f.ttl, f.key],

  parse(list: unknown[]): ChatFacts {
    const [type, edit, at, stream, n, thread, ttl, key] = list;
    const fits =
      list.length === 8 &&
      (type === 'message' || type === 'reaction' || type === 'deleted') &&
      factChecks.count(edit, 2 ** 31) &&
      factChecks.time(at) &&
      typeof stream === 'string' &&
      STREAM.test(stream) &&
      factChecks.count(n, 2 ** 31) &&
      n > 0 &&
      (thread === null || (typeof thread === 'string' && ID.test(thread))) &&
      (ttl === null || factChecks.count(ttl, 2 ** 31)) &&
      factChecks.hash(key);
    if (!fits) throw new Error('This message carries details Nil doesn’t accept.');
    return { type, edit, at, stream, n, thread, ttl, key } as ChatFacts;
  },
};

export default chatFacts;
