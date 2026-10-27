// A message as members get it: ciphertext, plus what the server needs to order and thread it.
export default function toChatMessage(row) {
  return {
    id: row.id,
    channelId: row.channel_id,
    seq: row.seq,
    threadId: row.thread_id,
    kind: row.kind,
    senderId: row.sender_id,
    epoch: row.epoch,
    sentAt: row.sent_at,
    bodyCt: row.body_ct,
    edits: row.edits,
    deleted: Boolean(row.deleted),
    replies: row.replies,
    lastReplyAt: row.last_reply_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
