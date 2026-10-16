import keyStatement from './keyStatement';
import recoverAddress from './recoverAddress';
import type KeyEntry from '../../types/KeyEntry';

const KEY = /^[A-Za-z0-9_-]{43}$/;

// Whether a published key really was signed, for this site and this workspace, by the wallet
// the entry names. The statement is rebuilt here from the fields, never taken from the server.
// That the wallet belongs to the member is the server's word; pinning covers the rest.
export default function verifyKeyStatement(entry: KeyEntry, { origin, workspaceKey }: { origin: string; workspaceKey: string }) {
  if (!KEY.test(entry.publicKey) || !KEY.test(entry.signingKey) || !Number.isSafeInteger(entry.createdAt) || !/^0x[0-9a-fA-F]{40}$/.test(entry.address)) return false;
  const message = keyStatement({ origin, address: entry.address, workspaceKey, userId: entry.userId, publicKey: entry.publicKey, signingKey: entry.signingKey, createdAt: entry.createdAt });
  return recoverAddress(message, entry.signature) === entry.address.toLowerCase();
}
