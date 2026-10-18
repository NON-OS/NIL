// One operation at a time per workspace (a backup, an upgrade, a rollback, a restore, a first
// start), shared by the server and the CLI, which are separate processes. Each lock is a lease:
// a process that dies holding one lets go of it when the lease runs out.
export default `
  CREATE TABLE locks (
    workspace_id TEXT PRIMARY KEY,
    holder TEXT NOT NULL,
    operation TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`;
