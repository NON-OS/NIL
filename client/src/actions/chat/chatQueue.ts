import store from '../../state/store';
import chatDisk from '../../lib/chatDisk';
import chatText from '../../lib/crypto/chatText';
import signedFacts from '../../lib/crypto/signedFacts';
import chatContent, { type Content } from '../../lib/chatContent';
import chatKeys from './chatKeys';
import chatRosters from './chatRosters';
import sealMessage from './sealMessage';
import type ChatChannelRow from '../../types/ChatChannelRow';
import type ChatItem from '../../types/ChatItem';

// A message waiting to be sent, as it's kept on this device: already signed and encrypted, with
// the ids of its encrypted files. Its words exist here only as ciphertext.
export interface Queued {
  id: string;
  channelId: string;
  threadId: string | null;
  type: ChatItem['type'];
  epoch: number;
  sentAt: number;
  ttl: number | null;
  stream: string;
  n: number;
  bodyCt: string;
  // files to send first, and those the server already has
  files: string[];
  sent: string[];
  ping: string[];
  // why the server refused it, for the person to try again or discard
  failed: string | null;
  // when it was written, which keeps the order
  at: number;
}

const prefix = () => `${store.get().workspaceKey}:${store.get().me?.id ?? ''}:`;

async function seal(channel: ChatChannelRow, q: Omit<Queued, 'epoch' | 'sentAt' | 'ttl' | 'bodyCt'>, content: Partial<Content>): Promise<Queued> {
  const key = await chatKeys.get(channel, await chatRosters.load(channel), channel.epoch);
  if (!key) throw new Error('You don’t hold this conversation’s key yet. A teammate’s browser hands it over once they’ve confirmed your key.');
  const sentAt = Date.now();
  const ttl = channel.disappearSeconds;
  const facts = { type: q.type, edit: 0, stream: q.stream, n: q.n, thread: q.threadId, ttl };
  const bodyCt = await sealMessage({ id: q.id, channelId: channel.id, epoch: channel.epoch, sentAt, key, facts, content });
  return { ...q, epoch: channel.epoch, sentAt, ttl, bodyCt };
}

// The queue on this device. Sealing happens as a message is written; sending can wait for the
// network, a reload or the next unlock. A message whose key has since been replaced, or that waited
// longer than the server accepts, is opened here and sealed again, keeping its place in its
// sender's numbering.
const chatQueue = {
  seal,

  async open(channel: ChatChannelRow, q: Queued): Promise<Content | null> {
    try {
      const key = await chatKeys.get(channel, await chatRosters.load(channel), q.epoch);
      if (!key) return null;
      const at = { workspaceKey: store.get().workspaceKey, channelId: channel.id, epoch: q.epoch, message: { id: q.id, senderId: store.get().me!.id, sentAt: q.sentAt } };
      const { signed } = signedFacts.open(await chatText.open(key, at, q.bodyCt));
      return q.type === 'deleted' ? chatContent.parse('{}') : chatContent.parse(signed.text);
    } catch {
      return null;
    }
  },

  async reseal(channel: ChatChannelRow, q: Queued, { tombstone = false } = {}) {
    const content = tombstone ? {} : await chatQueue.open(channel, q);
    if (!content) throw new Error('This message can’t be opened here any more to send it.');
    const type = tombstone ? 'deleted' : q.type;
    return seal(channel, { ...q, type, files: tombstone ? [] : q.files, ping: tombstone ? [] : q.ping, failed: null }, content);
  },

  save: (q: Queued) => chatDisk.put('queue', `${prefix()}${q.at}:${q.id}`, q),
  async drop(q: Queued) {
    await chatDisk.drop('queue', `${prefix()}${q.at}:${q.id}`);
    for (const id of q.files) await chatDisk.drop('files', `${prefix()}${id}`);
  },
  list: async () => (await chatDisk.list<Queued>('queue', prefix())).map(([, q]) => q).sort((a, b) => a.at - b.at),
  putFile: (id: string, body: Uint8Array) => chatDisk.put('files', `${prefix()}${id}`, body),
  getFile: (id: string) => chatDisk.get<Uint8Array>('files', `${prefix()}${id}`),
  clear: () => chatDisk.clear(prefix()),
};

export default chatQueue;
