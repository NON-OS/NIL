import http from '../../api/http';
import store from '../../state/store';
import keyring from '../../state/keyring';
import chatState from '../../state/chatState';
import chatText from '../../lib/crypto/chatText';
import chatMarkFacts, { type Scopes } from '../../lib/crypto/chatMarkFacts';
import signedFacts from '../../lib/crypto/signedFacts';
import keyHash from '../../lib/crypto/keyHash';
import keyDirectory from '../keyDirectory';
import chatKeys from './chatKeys';
import chatRosters from './chatRosters';
import sealGate from './sealGate';
import chatCounters from './chatCounters';
import markHistory from '../../state/markHistory';
import type ChatChannelRow from '../../types/ChatChannelRow';

type Row = { userId: string; stream: string; epoch: number; sentAt: number; bodyCt: string };

const PUBLISH_MS = 1500;
// channel id -> stream -> what this tab (or a queue it flushed) has sent there
const mine = new Map<string, Map<string, Scopes>>();
// channel id -> message id -> its newest edit made in this tab, -1 when deleted
const edited = new Map<string, Map<string, number>>();
const timers = new Map<string, number>();

const place = (channelId: string, epoch: number, stream: string, senderId: string, sentAt: number) => ({ workspaceKey: store.get().workspaceKey, channelId, epoch, message: { id: `mark.${stream}`, senderId, sentAt } });

async function publish(channelId: string) {
  const channel = chatState.get().channels[channelId];
  const id = keyring.identity();
  if (!channel || !id) return;
  const key = await sealGate(channel).then((chain) => chatKeys.get(channel, chain, channel.epoch)).catch(() => null);
  if (!key) return;
  const me = store.get().me!.id;
  const ownStream = chatCounters.stream;
  const streams = mine.get(channelId) ?? new Map<string, Scopes>();
  if (edited.get(channelId)?.size && !streams.has(ownStream)) streams.set(ownStream, {});
  for (const [stream, scopes] of streams) {
    const sentAt = Date.now();
    const at = place(channelId, channel.epoch, stream, me, sentAt);
    // a tab's edits ride on its own stream's mark
    const edits = stream === ownStream ? Object.fromEntries([...(edited.get(channelId) ?? [])].slice(-chatMarkFacts.maxEdits)) : undefined;
    const json = signedFacts.seal(JSON.stringify(edits ? { ...scopes, edits } : scopes), { kind: chatMarkFacts.kind, place: [at.workspaceKey, channelId, channel.epoch, stream, me, sentAt], facts: chatMarkFacts.list(sentAt, keyHash(key)), by: me, signingPrivate: id.signingPrivate });
    await http.put(`/chat/channels/${channelId}/marks/${stream}`, { epoch: channel.epoch, sentAt, bodyCt: await chatText.seal(key, at, json) }).catch(() => {});
  }
}

// Each tab's high-water marks: after it sends, it publishes how far it has numbered its messages
// in each timeline, signed and sealed. Readers open the marks of everyone in a conversation and
// compare them with what the server delivered.
const chatMarks = {
  record(channelId: string, stream: string, scope: string, n: number, until: number | null) {
    const byStream = mine.get(channelId) ?? new Map<string, Scopes>();
    const scopes = byStream.get(stream) ?? {};
    if ((scopes[scope]?.n ?? 0) < n) scopes[scope] = { n, until };
    byStream.set(stream, scopes);
    mine.set(channelId, byStream);
    clearTimeout(timers.get(channelId));
    timers.set(channelId, window.setTimeout(() => void publish(channelId), PUBLISH_MS));
  },

  // An edit or deletion this tab made, so a device that never saw it can't be shown the old one.
  edit(channelId: string, messageId: string, edit: number, deleted: boolean) {
    const held = edited.get(channelId) ?? new Map<string, number>();
    held.delete(messageId);
    held.set(messageId, deleted ? -1 : edit);
    edited.set(channelId, held);
    clearTimeout(timers.get(channelId));
    timers.set(channelId, window.setTimeout(() => void publish(channelId), PUBLISH_MS));
  },

  // A mark that checks out: sealed under its epoch's checked key for exactly this place, signed
  // by the member the server files it under, who is on that epoch's list.
  async open(channel: ChatChannelRow, row: Row) {
    try {
      const chain = await chatRosters.load(channel);
      const key = await chatKeys.get(channel, chain, row.epoch);
      const roster = chatRosters.at(chain, row.epoch);
      if (!key || !roster?.members.includes(row.userId)) return;
      const at = place(channel.id, row.epoch, row.stream, row.userId, row.sentAt);
      const { signed, facts } = signedFacts.open(await chatText.open(key, at, row.bodyCt));
      const f = chatMarkFacts.parse(facts ?? []);
      const statement = { kind: chatMarkFacts.kind, place: [at.workspaceKey, channel.id, row.epoch, row.stream, row.userId, row.sentAt], facts: chatMarkFacts.list(f.at, f.key) };
      if (signed.by !== row.userId || f.key !== keyHash(key) || !(await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k), { former: true }))) return;
      // never behind a mark seen before: a server can't serve an older one to hide what it held back
      const name = `${row.userId}/${row.stream}`;
      const scopes = markHistory.newest(channel.id, name, f.at, chatMarkFacts.scopes(signed.text));
      // edits only ever count forward, whichever mark told of them
      const before = chatState.get().marks[channel.id]?.[name]?.edits ?? {};
      const edits = { ...before };
      for (const [id, n] of Object.entries(chatMarkFacts.edits(signed.text))) if (edits[id] === undefined || (edits[id] !== -1 && (n === -1 || n > edits[id]))) edits[id] = n;
      chatState.set((s) => ({ marks: { ...s.marks, [channel.id]: { ...(s.marks[channel.id] ?? {}), [name]: { senderId: row.userId, scopes, edits } } } }));
    } catch {}
  },

  async load(channel: ChatChannelRow) {
    const { marks } = await http.get<{ marks: Row[] }>(`/chat/channels/${channel.id}/marks`).catch(() => ({ marks: [] as Row[] }));
    await Promise.all(marks.map((m) => chatMarks.open(channel, m)));
  },
};

export default chatMarks;
