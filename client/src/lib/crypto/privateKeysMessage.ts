// The message whose signature becomes your private-payout and anonymous-voting keys. Separate
// from the docs key on purpose: a leak of one never exposes the other. Like the docs key, it
// names the workspace by its signing key, never by its name, so a rename changes nothing, and
// it stays plain ASCII so hardware wallets can show it. Never change a shipped version, or
// every key derived from it changes too.
export default function privateKeysMessage({ workspaceKey, userId }: { workspaceKey: string; userId: string }) {
  return [
    'NONOS private keys',
    '',
    'Sign this to unlock private payouts and anonymous voting in the workspace below.',
    'It is not a transaction and costs nothing.',
    'Only sign this message inside your own NONOS app.',
    '',
    `Workspace key: ${workspaceKey}`,
    `Account: ${userId}`,
    'Version: 1',
  ].join('\n');
}
