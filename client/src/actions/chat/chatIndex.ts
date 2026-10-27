import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import store from '../../state/store';
import keyring from '../../state/keyring';
import chatState from '../../state/chatState';
import chatDisk from '../../lib/chatDisk';
import aesGcm from '../../lib/crypto/aesGcm';
import foldText from '../../lib/foldText';
import type ChatItem from '../../types/ChatItem';

export interface Entry {
  id: string;
  channelId: string;
  threadId: string | null;
  senderId: string | null;
  sentAt: number;
  text: string;
  // when it disappears, for one that does
  until: number | null;
}

type Bucket = Record<string, Entry>;
const DAY = 86_400_000;
const FLUSH_MS = 1500;
const pending = new Map<string, Map<string, Entry | null>>();
let timer: number | undefined;

const prefix = () => `${store.get().workspaceKey}:${store.get().me?.id ?? ''}:`;
// one bucket per conversation and month, so writing a message rewrites one small blob
const bucketOf = (channelId: string, sentAt: number) => `${prefix()}${channelId}:${new Date(sentAt).toISOString().slice(0, 7)}`;

// The index key, derived again from the unlocked identity whenever it's needed and never kept:
// locked, the index on this device can't be read.
function indexKey() {
  const id = keyring.identity();
  return id ? hkdf(sha256, id.seed, utf8ToBytes(prefix()), utf8ToBytes('nil/chat-search/v1'), 32) : null;
}

async function read(key: Uint8Array, name: string): Promise<Bucket> {
  const blob = await chatDisk.get<Uint8Array>('search', name);
  if (!blob) return {};
  try {
    return JSON.parse(new TextDecoder().decode(await aesGcm.open(key, blob, utf8ToBytes(name))));
  } catch {
    return {};
  }
}

const write = async (key: Uint8Array, name: string, bucket: Bucket) =>
  Object.keys(bucket).length ? chatDisk.put('search', name, await aesGcm.seal(key, new TextEncoder().encode(JSON.stringify(bucket)), utf8ToBytes(name))) : chatDisk.drop('search', name);

async function flush() {
  const key = indexKey();
  if (!key) return pending.clear();
  for (const [name, changes] of [...pending]) {
    pending.delete(name);
    const bucket = await read(key, name);
    for (const [id, entry] of changes) {
      if (entry) bucket[id] = entry;
      else delete bucket[id];
    }
    await write(key, name, bucket);
  }
  key.fill(0);
}

// What counts as gone: past its time, or older than a forward-secret conversation keeps.
function gone(e: Entry, now: number) {
  const days = chatState.get().channels[e.channelId]?.forwardDays;
  return (e.until !== null && e.until <= now) || (days ? e.sentAt < now - days * DAY : false);
}

// Search over everything this browser has decrypted, in any tab and any visit, kept on this
// device encrypted under a key derived from the unlocked identity. Disappearing messages and
// forward-secret conversations stay out of it, since a stolen identity would open the index.
// leaving the page writes what's waiting, so a reload loses nothing
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush());

const chatIndex = {
  note(items: ChatItem[]) {
    for (const m of items) {
      if (!m.seq || m.state !== 'ok' || m.reaction) continue;
      // what's meant to vanish never lands on the device: disappearing messages, and anything in
      // a forward-secret conversation, are searched only while this tab holds them
      if (m.expiresAt || chatState.get().channels[m.channelId]?.forwardDays) continue;
      const name = bucketOf(m.channelId, m.sentAt);
      const changes = pending.get(name) ?? new Map<string, Entry | null>();
      const text = [m.text, ...m.files.map((f) => f.name)].join(' ').trim();
      changes.set(m.id, m.type === 'message' && text ? { id: m.id, channelId: m.channelId, threadId: m.threadId, senderId: m.senderId, sentAt: m.sentAt, text, until: m.expiresAt } : null);
      pending.set(name, changes);
    }
    // written soon after the first change, however busy the conversation keeps it
    timer ??= window.setTimeout(() => {
      timer = undefined;
      void flush();
    }, FLUSH_MS);
  },

  async search(query: string, { limit = 100 } = {}): Promise<Entry[]> {
    const words = foldText(query).split(/\s+/).filter(Boolean);
    const key = indexKey();
    if (!words.length || !key) return [];
    await flush();
    const now = Date.now();
    const hits: Entry[] = [];
    for (const [name] of await chatDisk.list('search', prefix())) {
      const bucket = await read(key, name);
      let pruned = false;
      for (const e of Object.values(bucket)) {
        if (gone(e, now)) {
          delete bucket[e.id];
          pruned = true;
        } else if (words.every((w) => foldText(e.text).includes(w))) hits.push(e);
      }
      if (pruned) await write(key, name, bucket);
    }
    key.fill(0);
    return hits.sort((a, b) => b.sentAt - a.sentAt).slice(0, limit);
  },

  forget: (channelId: string) => chatDisk.list('search', `${prefix()}${channelId}:`).then((all) => Promise.all(all.map(([name]) => chatDisk.drop('search', name)))),
};

export default chatIndex;
