const reason = (err: unknown) => String((err as { message?: unknown } | null)?.message ?? '');

// What to tell someone when connecting their phone didn't work. The raw error can name the
// connection's topics, so it's never shown; one of these is.
export default function pairingOutcome(err: unknown): { status: 'expired' | 'failed'; message: string | null } {
  if (/expired/i.test(reason(err))) return { status: 'expired', message: null };
  if ([4001, 5000, 5001, 5002].includes((err as { code?: number } | null)?.code ?? 0)) return { status: 'failed', message: 'You declined the connection on your phone.' };
  if (/socket|relay|connection|online/i.test(reason(err))) return { status: 'failed', message: 'Nil couldn’t reach the WalletConnect relay. Check this computer’s connection, or ask whoever runs the server whether phone wallets work here.' };
  return { status: 'failed', message: 'Connecting your phone wallet didn’t work. Try again.' };
}
