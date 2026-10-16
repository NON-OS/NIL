// Due times, push notifications and calendar feeds.
//
// A task's due date stays the calendar day it was set for. When it also has a time, due_at holds
// that moment in UTC and due_tz the time zone it was picked in, so a repeating task keeps its
// wall-clock time across daylight saving changes. due_alerted remembers which due moment was
// already announced, so moving the date or time re-arms the note by itself.
//
// A push subscription belongs to the session that made it: signing out, or the session running
// out, stops notifications to that browser.
//
// A calendar feed link is its id plus a MAC made with a key kept in DATA_DIR/keys, so the
// database alone doesn't hold working links.
const dueTimesPushFeeds = `
  ALTER TABLE tasks ADD COLUMN due_at INTEGER;
  ALTER TABLE tasks ADD COLUMN due_tz TEXT;
  ALTER TABLE tasks ADD COLUMN due_alerted TEXT;
  CREATE INDEX tasks_due_at ON tasks(due_at) WHERE due_at IS NOT NULL;

  CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    show_names INTEGER NOT NULL DEFAULT 1,
    time_zone TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
  CREATE INDEX push_subscriptions_session ON push_subscriptions(session_hash);

  CREATE TABLE calendar_feeds (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    used_at INTEGER
  );
`;

export default dueTimesPushFeeds;
