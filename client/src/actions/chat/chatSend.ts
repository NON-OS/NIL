import http from '../../api/http';
import ApiError from '../../api/ApiError';
import store from '../../state/store';
import chatState from '../../state/chatState';
import b64u from '../../lib/crypto/b64u';
import chatChannels from './chatChannels';
import chatCounters from './chatCounters';
import chatFiles from './chatFiles';
import chatTimeline from './chatTimeline';
import chatMarks from './chatMarks';
import chatQueue, { type Queued } from './chatQueue';
import sealGate from './sealGate';
import type { Content } from '../../lib/chatContent';
import type ChatItem from '../../types/ChatItem';
import type ChatChannel from '../../types/ChatChannel';
import type ChatMessageRow from '../../types/ChatMessageRow';

// how old a sealed message may get before it's sealed again with a fresh time, well inside
// what the server accepts (CHAT_CLOCK_SKEW_SECONDS)
const FRESH_MS = 4 * 60_000;
let flushing = false;

const offline = (err: unknown) => err instanceof ApiError && err.status === 0;

// What the timeline shows for a message still on its way.
function shown(q: Queued, content: Partial<Content> | null, pending: ChatItem['pending'], error?: string): ChatItem {
  return {
    id: q.id,
    channelId: q.channelId,
    seq: 0,
    threadId: q.threadId,
    senderId: store.get().me!.id,
    sentAt: q.sentAt,
    epoch: q.epoch,
    type: q.type,
    reaction: q.type === 'reaction',
    text: content?.text ?? (content ? '' : 'A message waiting to be sent'),
    files: content?.files ?? [],
    mentions: content?.mentions ?? [],
    emoji: content?.emoji ?? null,
    target: content?.target ?? null,
    edit: 0,
    editedAt: null,
    replies: 0,
    lastReplyAt: null,
    expiresAt: null,
    stream: q.stream,
    n: q.n,
    state: 'ok',
    pending,
    error,
  };
}

async function display(q: Queued, pending: ChatItem['pending'], error?: string) {
  const channel = chatState.get().channels[q.channelId];
  if (!channel || q.type !== 'message') return;
  chatTimeline.local(shown(q, await chatQueue.open(channel, q), pending, error));
}

// One send: a new key first when this browser should start one, the message sealed again if its
// key changed or it waited too long, its files, then the message itself.
async function deliver(q: Queued, retry = true): Promise<void> {
  let channel = chatState.get().channels[q.channelId] ?? (await chatChannels.refresh(q.channelId));
  if (!channel) throw new ApiError(404, 'This conversation is gone.');
  await chatChannels.tend(channel);
  channel = chatState.get().channels[channel.id] ?? channel;
  if (q.epoch !== channel.epoch || q.ttl !== channel.disappearSeconds || Date.now() - q.sentAt > FRESH_MS) {
    q = await chatQueue.reseal(channel, q, { tombstone: q.type === 'deleted' });
    await chatQueue.save(q);
  } else if (q.type !== 'deleted') {
    // sealed a moment ago under this key, but whoever holds it may have changed since
    await sealGate(channel);
  }
  for (const id of q.files.filter((f) => !q.sent.includes(f))) {
    const body = await chatQueue.getFile(id);
    if (!body) throw new ApiError(400, 'A file in this message is gone from this device.');
    await chatFiles.send(channel.id, id, body);
    q = { ...q, sent: [...q.sent, id] };
    await chatQueue.save(q);
  }
  const body = { id: q.id, kind: q.type === 'reaction' ? 'reaction' : 'message', threadId: q.threadId, epoch: q.epoch, sentAt: q.sentAt, ttl: q.ttl, bodyCt: q.bodyCt, files: q.files, ping: q.ping, deleted: q.type === 'deleted' };
  let message: ChatMessageRow | null = null;
  try {
    message = (await http.post<{ message: ChatMessageRow }>(`/chat/channels/${channel.id}/messages`, body)).message;
  } catch (err) {
    const known = err instanceof ApiError && err.status === 409 && /already sent/.test(err.message);
    if (!known && retry && err instanceof ApiError && err.status === 409) {
      await chatChannels.refresh(channel.id);
      return deliver({ ...q, sentAt: 0 }, false);
    }
    if (!known) throw err;
  }
  await chatQueue.drop(q);
  chatMarks.record(channel.id, q.stream, q.threadId ?? 'main', q.n, q.ttl ? q.sentAt + q.ttl * 1000 : null);
  if (message) await chatTimeline.arrive(channel, message);
}

async function flush() {
  if (flushing || !store.get().docsUnlocked) return;
  flushing = true;
  try {
    for (const q of await chatQueue.list()) {
      if (q.failed) continue;
      if (!navigator.onLine) return void (await display(q, 'queued'));
      await display(q, 'sending');
      try {
        await deliver(q);
      } catch (err) {
        if (offline(err)) return void (await display(q, 'queued'));
        const why = err instanceof Error ? err.message : 'Not sent.';
        await chatQueue.save({ ...q, failed: why });
        await display(q, 'failed', why);
      }
    }
  } finally {
    flushing = false;
  }
}

window.addEventListener('online', () => void flush());

async function queue(channel: ChatChannel, type: ChatItem['type'], threadId: string | null, content: Partial<Content>, uploads: File[] = [], ping: string[] = []) {
  const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
  const files = [];
  const bodies: [string, Uint8Array][] = [];
  for (const file of uploads) {
    const prepared = await chatFiles.prepare(channel.id, file);
    files.push(prepared.file);
    bodies.push([prepared.file.id, prepared.body]);
  }
  // the number is taken now: once sealed, this message is sent, or sent as a tombstone
  const n = chatCounters.peek(channel.id, threadId);
  const draft = { id, channelId: channel.id, threadId, type, stream: chatCounters.stream, n, files: files.map((f) => f.id), sent: [], ping, failed: null, at: Date.now() };
  const q = await chatQueue.seal(channel, draft, { ...content, files });
  chatCounters.used(channel.id, threadId, n);
  for (const [fileId, body] of bodies) await chatQueue.putFile(fileId, body);
  await chatQueue.save(q);
  if (type === 'message') chatTimeline.local(shown(q, { ...content, files }, navigator.onLine ? 'sending' : 'queued'));
  void flush();
}

// Sending. Every message is signed and encrypted as it's written and kept on this device, as
// ciphertext only, until the server has it: it survives going offline, a reload or closing the
// tab, and goes on the next unlock. A message the server refuses stays, marked, to try again or
// discard; discarding sends a signed tombstone in its place, so its number isn't missed.
const chatSend = {
  async message(channel: ChatChannel, { text, files = [], threadId = null, mentions = [] }: { text: string; files?: File[]; threadId?: string | null; mentions?: string[] }) {
    await queue(channel, 'message', threadId, { text, mentions }, files, mentions.filter((id) => channel.members.includes(id)));
  },

  react: (channel: ChatChannel, target: ChatItem, emoji: string) => queue(channel, 'reaction', target.threadId, { emoji, target: target.id }),

  async retry(id: string) {
    const q = (await chatQueue.list()).find((x) => x.id === id);
    if (!q) return;
    await chatQueue.save({ ...q, failed: null });
    void flush();
  },

  async discard(item: ChatItem) {
    chatTimeline.drop(item.channelId, item.threadId, item.id);
    const q = (await chatQueue.list()).find((x) => x.id === item.id);
    const channel = q && chatState.get().channels[q.channelId];
    if (!q || !channel) return;
    try {
      await chatQueue.drop(q);
      await chatQueue.save(await chatQueue.reseal(channel, q, { tombstone: true }));
    } catch {
      // not a member any more, or the key is gone: nobody is waiting on its number
    }
    void flush();
  },

  // Shows what waits on this device and sends it, after an unlock.
  async restore() {
    for (const q of await chatQueue.list()) if (q.type === 'message') await display(q, q.failed ? 'failed' : navigator.onLine ? 'sending' : 'queued', q.failed ?? undefined);
    await flush();
  },

  flush,
};

export default chatSend;
