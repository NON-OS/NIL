// Private tasks sealed in the browser. `sealed` holds the encrypted title, notes and checklist,
// plus the task key wrapped once for each person allowed to open it; the plain columns stay
// empty. Comments on a sealed task are encrypted with the same key and flagged here.
const sealedTasks = `
  ALTER TABLE tasks ADD COLUMN sealed TEXT;
  ALTER TABLE comments ADD COLUMN sealed INTEGER NOT NULL DEFAULT 0;
`;

export default sealedTasks;
