// Chat, second round. Signed departures: a member's own statement that they left a conversation,
// or an admin's that someone left the team, which lets any member's browser start the next key
// without them. History keys handed to newcomers, kept apart per giver, so one bad copy can't
// stand in for a good one. Each sending tab's signed, sealed high-water mark, which shows when the
// server held back the last thing it sent. And forward-secret conversations, whose old keys go.
const chatDepartures = `
  CREATE TABLE chat_departures (
    id INTEGER PRIMARY KEY,
    channel_id TEXT REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    statement TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX chat_departures_user ON chat_departures(user_id);
  CREATE INDEX chat_departures_channel ON chat_departures(channel_id) WHERE channel_id IS NOT NULL;
  CREATE INDEX chat_departures_signer ON chat_departures(signed_by) WHERE signed_by IS NOT NULL;

  ALTER TABLE chat_epochs ADD COLUMN proofs TEXT;

  CREATE TABLE chat_history_keys (
    channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    epoch INTEGER NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wrapped_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, epoch, user_id, granted_by)
  );
  CREATE INDEX chat_history_keys_user ON chat_history_keys(user_id);
  CREATE INDEX chat_history_keys_granter ON chat_history_keys(granted_by);

  CREATE TABLE chat_marks (
    channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stream TEXT NOT NULL,
    epoch INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    body_ct TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, user_id, stream)
  );
  CREATE INDEX chat_marks_user ON chat_marks(user_id);
  CREATE INDEX chat_marks_age ON chat_marks(updated_at);

  ALTER TABLE chat_channels ADD COLUMN forward_days INTEGER;
  ALTER TABLE chat_channels ADD COLUMN purged_epoch INTEGER NOT NULL DEFAULT 0;
`;

export default chatDepartures;
