// End-to-end encrypted team chat. A channel's messages are encrypted under the key of an epoch,
// sealed to each member's own key; a new epoch starts when someone leaves and on a schedule. The
// server keeps who is in which channel, the signed member list of each epoch, and ciphertext:
// channel names and topics, messages, reactions and files alike.
const chat = `
  CREATE TABLE chat_channels (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('channel', 'dm', 'group')),
    audience TEXT NOT NULL CHECK (audience IN ('team', 'people')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    -- the two people of a direct message, sorted, so there's only ever one between them
    pair TEXT UNIQUE,
    meta_ct TEXT,
    meta_epoch INTEGER,
    disappear_seconds INTEGER,
    epoch INTEGER NOT NULL DEFAULT 0,
    epoch_at INTEGER,
    seq INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL
  );

  CREATE TABLE chat_members (
    channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, user_id)
  );
  CREATE INDEX chat_members_user ON chat_members(user_id);

  CREATE TABLE chat_reads (
    channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_seq INTEGER NOT NULL DEFAULT 0,
    notify TEXT NOT NULL DEFAULT 'default' CHECK (notify IN ('default', 'all', 'mentions', 'none')),
    PRIMARY KEY (channel_id, user_id)
  );

  CREATE TABLE chat_epochs (
    channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    epoch INTEGER NOT NULL,
    roster TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, epoch)
  );

  CREATE TABLE chat_epoch_keys (
    channel_id TEXT NOT NULL,
    epoch INTEGER NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wrapped_key TEXT NOT NULL,
    granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, epoch, user_id),
    FOREIGN KEY (channel_id, epoch) REFERENCES chat_epochs(channel_id, epoch) ON DELETE CASCADE
  );
  CREATE INDEX chat_epoch_keys_user ON chat_epoch_keys(user_id);

  CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    thread_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('message', 'reaction')),
    sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    epoch INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    body_ct TEXT NOT NULL,
    edits INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    replies INTEGER NOT NULL DEFAULT 0,
    last_reply_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER,
    UNIQUE (channel_id, seq)
  );
  CREATE INDEX chat_messages_thread ON chat_messages(channel_id, thread_id, seq);
  CREATE INDEX chat_messages_expiry ON chat_messages(expires_at) WHERE expires_at IS NOT NULL;

  CREATE TABLE chat_files (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX chat_files_channel ON chat_files(channel_id);
  CREATE INDEX chat_files_uploader ON chat_files(uploader_id);
  CREATE INDEX chat_files_message ON chat_files(message_id);
`;

export default chat;
