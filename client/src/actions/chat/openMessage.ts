import store from '../../state/store';
import chatText from '../../lib/crypto/chatText';
import chatFacts from '../../lib/crypto/chatFacts';
import signedFacts from '../../lib/crypto/signedFacts';
import keyHash from '../../lib/crypto/keyHash';
import chatContent from '../../lib/chatContent';
import editHistory from '../../state/editHistory';
import keyDirectory from '../keyDirectory';
import chatKeys from './chatKeys';
import chatRosters, { type Chain } from './chatRosters';
import type ChatItem from '../../types/ChatItem';
import type ChatMessageRow from '../../types/ChatMessageRow';
import type ChatChannelRow from '../../types/ChatChannelRow';

// how far apart a sender's clock and the one that started the next key may be: each is within
// the server's allowance (CHAT_CLOCK_SKEW_SECONDS, ten minutes) of the server's
const SKEW_MS = 20 * 60_000;

const shell = (row: ChatMessageRow, state: ChatItem['state']): ChatItem => ({
  id: row.id,
  channelId: row.channelId,
  seq: row.seq,
  threadId: row.threadId,
  senderId: row.senderId,
  sentAt: row.sentAt,
  epoch: row.epoch,
  type: row.deleted ? 'deleted' : row.kind,
  reaction: row.kind === 'reaction',
  text: '',
  files: [],
  mentions: [],
  emoji: null,
  target: null,
  edit: row.edits,
  editedAt: null,
  replies: row.replies,
  lastReplyAt: row.lastReplyAt,
  expiresAt: row.expiresAt,
  stream: '',
  n: 0,
  state,
});

// Opens one message and checks it. It shows only when it decrypts under its epoch's checked key
// for exactly this conversation, id, sender and time, and its sender is on that epoch's signed
// member list and signed it, naming that key. What the server says about it (thread, kind, edit
// number, deleted or not) has to match what the sender signed.
export default async function openMessage(row: ChatMessageRow, channel: ChatChannelRow, chain: Chain): Promise<ChatItem> {
  let key: Uint8Array | null;
  try {
    key = await chatKeys.get(channel, chain, row.epoch);
  } catch {
    return shell(row, 'unverified');
  }
  const roster = chatRosters.at(chain, row.epoch);
  if (!key) return shell(row, roster || chain.broken === null ? 'locked' : 'unverified');
  try {
    if (!row.senderId) throw new Error('no sender');
    const at = { workspaceKey: store.get().workspaceKey, channelId: channel.id, epoch: row.epoch, message: { id: row.id, senderId: row.senderId, sentAt: row.sentAt } };
    const { signed, facts } = signedFacts.open(await chatText.open(key, at, row.bodyCt));
    const f = chatFacts.parse(facts ?? []);
    const kindFits = row.kind === 'reaction' ? f.type === 'reaction' || f.type === 'deleted' : f.type !== 'reaction';
    const fits = signed.by === row.senderId && roster?.members.includes(signed.by) && f.key === keyHash(key) && f.thread === row.threadId && f.edit === row.edits && row.deleted === (f.type === 'deleted') && kindFits;
    const statement = { kind: chatFacts.kind, place: chatFacts.place(at), facts: chatFacts.list(f) };
    // the server takes messages only under a conversation's newest key, so anything signed under
    // one after the next key started is the server's doing with someone who kept the old key,
    // someone taken out, say; not a message
    const next = chatRosters.at(chain, row.epoch + 1);
    const afterOut = next && Math.max(f.at, row.sentAt) > next.at + SKEW_MS;
    if (!fits || afterOut || !(await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k)))) throw new Error('unverified');
    if (editHistory.stale(row.id, f.edit, f.type === 'deleted')) throw new Error('older edit');
    editHistory.record(row.id, f.edit, f.type === 'deleted');
    const content = f.type === 'deleted' ? chatContent.parse('{}') : chatContent.parse(signed.text);
    const expiresAt = f.ttl ? row.sentAt + f.ttl * 1000 : null;
    return { ...shell(row, 'ok'), ...content, type: f.type, edit: f.edit, editedAt: f.edit ? f.at : null, stream: f.stream, n: f.n, expiresAt };
  } catch {
    return shell(row, 'unverified');
  }
}
