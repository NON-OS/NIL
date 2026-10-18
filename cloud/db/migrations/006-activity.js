// When a workspace's data last changed, from the modification time of its database files (never
// their contents). It decides when a claimed workspace nobody uses is paused and later reclaimed.
export default `
  ALTER TABLE workspaces ADD COLUMN active_at INTEGER;
`;
