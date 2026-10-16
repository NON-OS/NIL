// Indexes for the hourly purge, which otherwise reads every comment, activity entry and read
// notification to find the old ones, and for tasks by creator: erasing a person makes SQLite
// find their tasks through the creator_id foreign key, and private-task visibility filters on
// it. IF NOT EXISTS keeps this independent of any migration numbered before it.
const purgeIndexes = `
  CREATE INDEX IF NOT EXISTS comments_created ON comments(created_at);
  CREATE INDEX IF NOT EXISTS activity_created ON activity(created_at);
  CREATE INDEX IF NOT EXISTS notifications_read ON notifications(read_at) WHERE read_at IS NOT NULL;
  CREATE INDEX IF NOT EXISTS tasks_creator ON tasks(creator_id);
`;

export default purgeIndexes;
