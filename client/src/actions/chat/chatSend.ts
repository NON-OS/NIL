import http from '../../api/http';
import ApiError from '../../api/ApiError';
import store from '../../state/store';
import chatState from '../../state/chatState';
import b64u from '../../lib/crypto/b64u';
import chatKeys from './chatKeys';
import chatRosters from './chatRosters';
import chatChannels from './chatChannels';
import chatCounters from './chatCounters';
import chatFiles from './chatFiles';
import chatTimeline from './chatTimeline';
import sealMessage from './sealMessage';
import type { Content } from '../../lib/chatContent';
import type ChatItem from '../../types/ChatItem';
import type ChatChannel from '../../types/ChatChannel';
import type ChatMessageRow from '../../types/ChatMessageRow';

interface Job {
  item: ChatItem;
  content: Partial<Content>;
  uploads: File[];
  n: number | null;
  // a send that may have reached the server before the connection went
  uncertain: boolean;
}

const queue: Job[] = [];
let flushing = false;

const offline = (err: unknown) => err instanceof ApiError && err.status === 0;
const show = (job: Job, patch: Partial<ChatItem>) => {
  job.item = { ...job.item, ...patch };
  chatTimeline.local(job.item);
};

// One send: the conversation's current key (starting a new epoch first when it's due), files
// encrypted and stored, then the message signed and sealed. A key that changed on the way, or a
// new disappearing setting, means a fresh look at the conversation and one more try.
async function deliver(job: Job, retry = true): Promise<void> {
  let channel = chatState.get().channels[job.item.channelId];
  if (!channel) throw new Error('This conversation is gone.');
  await chatChannels.tend(channel);
  channel = chatState.get().channels[channel.id] ?? channel;
  const key = await chatKeys.get(channel, await chatRosters.load(channel), channel.epoch);
  if (!key) throw new Error('You don’t hold this conversation’s key yet. A teammate’s browser hands it over once they’ve confirmed your key.');
  if (job.uploads.length) {
    const files = [];
    for (const file of job.uploads) files.push(await chatFiles.upload(channel.id, file));
    job.content = { ...job.content, files };
    job.uploads = [];
  }
  const { item } = job;
  job.n ??= chatCounters.peek(channel.id, item.threadId);
  const sentAt = Date.now();
  const facts = { type: item.type, edit: 0, stream: chatCounters.stream, n: job.n, thread: item.threadId, ttl: channel.disappearSeconds };
  const bodyCt = await sealMessage({ id: item.id, channelId: channel.id, epoch: channel.epoch, sentAt, key, facts, content: job.content });
  const mentions = (job.content.mentions ?? []).filter((id) => channel!.members.includes(id));
  try {
    job.uncertain = true;
    const body = { id: item.id, kind: item.type, threadId: item.threadId, epoch: channel.epoch, sentAt, ttl: channel.disappearSeconds, bodyCt, files: (job.content.files ?? []).map((f) => f.id), ping: mentions };
    const { message } = await http.post<{ message: ChatMessageRow }>(`/chat/channels/${channel.id}/messages`, body);
    chatCounters.used(channel.id, item.threadId, job.n);
    await chatTimeline.arrive(channel, message);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && /already sent/.test(err.message)) return chatCounters.used(channel.id, item.threadId, job.n);
    if (!offline(err)) job.uncertain = false;
    if (retry && err instanceof ApiError && err.status === 409) {
      await chatChannels.refresh(channel.id);
      return deliver(job, false);
    }
    throw err;
  }
}

async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.length) {
      const job = queue[0];
      if (!navigator.onLine) return show(job, { pending: 'queued' });
      show(job, { pending: 'sending', error: undefined });
      try {
        await deliver(job);
        queue.shift();
      } catch (err) {
        if (offline(err)) return show(job, { pending: 'queued' });
        queue.shift();
        if (job.uncertain && job.n) chatCounters.used(job.item.channelId, job.item.threadId, job.n);
        show(job, { pending: 'failed', error: err instanceof Error ? err.message : 'Not sent.' });
        failed.set(job.item.id, job);
      }
    }
  } finally {
    flushing = false;
  }
}

const failed = new Map<string, Job>();
window.addEventListener('online', () => void flush());

function draft(channel: ChatChannel, type: ChatItem['type'], threadId: string | null, content: Partial<Content>): ChatItem {
  return {
    id: b64u.encode(crypto.getRandomValues(new Uint8Array(16))),
    channelId: channel.id,
    seq: 0,
    threadId,
    senderId: store.get().me!.id,
    sentAt: Date.now(),
    epoch: channel.epoch,
    type,
    reaction: type === 'reaction',
    text: content.text ?? '',
    files: [],
    mentions: content.mentions ?? [],
    emoji: content.emoji ?? null,
    target: content.target ?? null,
    edit: 0,
    editedAt: null,
    replies: 0,
    lastReplyAt: null,
    expiresAt: null,
    stream: chatCounters.stream,
    n: 0,
    state: 'ok',
    pending: navigator.onLine ? 'sending' : 'queued',
  };
}

// Sending. Every message waits in order in this tab's queue, in memory only, and shows as
// queued while there's no network; it goes as soon as there is. A message the server refuses
// stays on screen, marked, to try again or discard.
const chatSend = {
  message(channel: ChatChannel, { text, files = [], threadId = null, mentions = [] }: { text: string; files?: File[]; threadId?: string | null; mentions?: string[] }) {
    const item = draft(channel, 'message', threadId, { text, mentions });
    queue.push({ item: { ...item, files: files.map((f) => ({ id: '', name: f.name, type: f.type, size: f.size, hash: '', key: '' })) }, content: { text, mentions }, uploads: files, n: null, uncertain: false });
    chatTimeline.local(queue[queue.length - 1].item);
    void flush();
    return item.id;
  },

  react(channel: ChatChannel, target: ChatItem, emoji: string) {
    const job = { item: draft(channel, 'reaction', target.threadId, { emoji, target: target.id }), content: { emoji, target: target.id }, uploads: [], n: null, uncertain: false };
    queue.push(job);
    void flush();
  },

  retry(id: string) {
    const job = failed.get(id);
    if (!job) return;
    failed.delete(id);
    queue.push({ ...job, n: null, uncertain: false });
    void flush();
  },

  discard(item: ChatItem) {
    failed.delete(item.id);
    chatTimeline.drop(item.channelId, item.threadId, item.id);
  },

  flush,
};

export default chatSend;
