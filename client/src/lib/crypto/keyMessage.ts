// The message whose signature becomes your encryption key. It names the workspace by its
// signing key (which survives moving servers) and your account, so the same wallet yields a
// different key everywhere else. Never change a shipped version: old keys would stop working.
export default function keyMessage({ workspace, workspaceKey, userId }: { workspace: string; workspaceKey: string; userId: string }) {
  return [
    'NONOS encryption key',
    '',
    `Sign this to unlock end-to-end encrypted docs in “${workspace}”.`,
    'It is not a transaction and costs nothing.',
    'Only sign this message inside your own NONOS app.',
    '',
    `Workspace key: ${workspaceKey}`,
    `Account: ${userId}`,
    'Version: 1',
  ].join('\n');
}
