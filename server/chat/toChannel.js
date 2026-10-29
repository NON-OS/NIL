import sql from '../db/sql.js';
import config from '../config.js';
import channelMembers from './channelMembers.js';
import departures from './departures.js';
import wrapsFor from './wrapsFor.js';

// A channel as one member sees it: the ciphertext of its name and topic, who is in it and who
// holds the current key, their own sealed copies of the keys the name and the newest messages
// need, and how far they've read. Unread counts only top-level messages from other people.
export default function toChannel(channel, viewer) {
  const read = sql.get('SELECT read_seq, notify FROM chat_reads WHERE channel_id = ? AND user_id = ?', channel.id, viewer.id);
  const readSeq = read?.read_seq ?? 0;
  const unread = sql.get(
    "SELECT COUNT(*) AS n FROM chat_messages WHERE channel_id = ? AND seq > ? AND thread_id IS NULL AND kind = 'message' AND deleted = 0 AND sender_id IS NOT ? AND (expires_at IS NULL OR expires_at > ?)",
    channel.id, readSeq, viewer.id, Date.now(),
  ).n;
  return {
    id: channel.id,
    kind: channel.kind,
    audience: channel.audience,
    createdBy: channel.created_by,
    createdAt: channel.created_at,
    lastAt: channel.last_at,
    seq: channel.seq,
    epoch: channel.epoch,
    epochAt: channel.epoch_at,
    rotateAt: channel.epoch_at ? channel.epoch_at + config.chat.epochMs : null,
    metaCt: channel.meta_ct,
    metaEpoch: channel.meta_epoch,
    disappearSeconds: channel.disappear_seconds,
    members: channelMembers(channel),
    keyHolders: sql.all('SELECT user_id FROM chat_epoch_keys WHERE channel_id = ? AND epoch = ? ORDER BY user_id', channel.id, channel.epoch).map((r) => r.user_id),
    wrappedKeys: wrapsFor(channel.id, channel.epoch, viewer.id),
    metaKeys: channel.meta_epoch === channel.epoch ? [] : wrapsFor(channel.id, channel.meta_epoch, viewer.id),
    departures: departures(channel),
    forwardDays: channel.forward_days,
    purgedEpoch: channel.purged_epoch,
    readSeq,
    unread,
    notify: read?.notify ?? 'default',
  };
}
