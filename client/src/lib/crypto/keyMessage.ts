// The message whose signature becomes your encryption key. It names the workspace by its
// signing key, never by its name: the key stays the same when the workspace is renamed or moved
// to another server with a capsule, so your key does too. Your account is in it as well, so the
// same wallet yields a different key everywhere else. It stays plain ASCII because some hardware
// wallets show anything else as hex, and people should be able to read what they sign.
// Never change a shipped version: old keys would stop working.
export default function keyMessage({ workspaceKey, userId }: { workspaceKey: string; userId: string }) {
  return [
    'NONOS encryption key',
    '',
    'Sign this to unlock end-to-end encrypted docs in the workspace below.',
    'It is not a transaction and costs nothing.',
    'Only sign this message inside your own NONOS app.',
    '',
    `Workspace key: ${workspaceKey}`,
    `Account: ${userId}`,
    'Version: 1',
  ].join('\n');
}
