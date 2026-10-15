// The message whose signature becomes your private-payout and anonymous-voting keys. Separate
// from the docs key on purpose: a leak of one never exposes the other. Never change a shipped
// version, or every key derived from it changes too.
export default function privateKeysMessage({ workspace, workspaceKey, userId }: { workspace: string; workspaceKey: string; userId: string }) {
  return [
    'NONOS private keys',
    '',
    `Sign this to unlock private payouts and anonymous voting in “${workspace}”.`,
    'It is not a transaction and costs nothing.',
    'Only sign this message inside your own NONOS app.',
    '',
    `Workspace key: ${workspaceKey}`,
    `Account: ${userId}`,
    'Version: 1',
  ].join('\n');
}
