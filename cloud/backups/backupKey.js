import backupFormat from './backupFormat.js';

// Where a backup is stored. Workspaces are filed by their random id, never their name, so the
// storage provider learns nothing about who the customers are.
export default function backupKey(workspaceId, kind, at) {
  const stamp = new Date(at).toISOString().replace(/[:.]/g, '-');
  return workspaceId ? `workspaces/${workspaceId}/${stamp}-${kind}${backupFormat.extension}` : `control/${stamp}${backupFormat.extension}`;
}
