import eip4361 from './eip4361';

export interface UnlockFields {
  origin: string;
  address: string;
  workspaceKey: string;
  userId: string;
  nonce: string;
  issuedAt: string;
}

// The message whose signature opens your identity on one wallet. The signature never leaves the
// browser: stretched with HKDF it becomes the key to that wallet's wrap of your identity, which
// the server holds and can't open. The nonce and date are stored with the wrap, so each new wrap
// (after a reset, say) has its own message and an old signature opens nothing.
export default function unlockMessage({ origin, address, workspaceKey, userId, nonce, issuedAt }: UnlockFields) {
  const host = new URL(origin).host;
  return eip4361({
    origin,
    address,
    statement: `Unlock my Nil encryption keys. Sign this only on ${host}. This is not a transaction and costs nothing.`,
    nonce,
    issuedAt,
    resources: [`urn:nil:workspace:${workspaceKey}`, `urn:nil:account:${userId}`, 'urn:nil:purpose:unlock-keys'],
  });
}
