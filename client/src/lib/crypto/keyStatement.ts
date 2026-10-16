import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import eip4361 from './eip4361';

export interface KeyStatementFields {
  origin: string;
  address: string;
  workspaceKey: string;
  userId: string;
  publicKey: string;
  signingKey: string;
  createdAt: number;
}

// The message a member's wallet signs to publish their encryption and signing keys. Teammates'
// browsers rebuild it from the published fields and check the signature themselves, so the
// server can't hand out a key the member never signed. Must match server/keys/keyStatement.js
// byte for byte. Never change a shipped version: every published key would stop verifying.
export default function keyStatement({ origin, address, workspaceKey, userId, publicKey, signingKey, createdAt }: KeyStatementFields) {
  return eip4361({
    origin,
    address,
    statement: 'Publish my Nil encryption keys for this workspace. Teammates use them to share docs, private tasks and vote shares with me. This is not a transaction and costs nothing.',
    nonce: bytesToHex(sha256(utf8ToBytes(`${publicKey}${signingKey}`))).slice(0, 16),
    issuedAt: new Date(createdAt).toISOString(),
    resources: [`urn:nil:workspace:${workspaceKey}`, `urn:nil:account:${userId}`, `urn:nil:encryption-key:${publicKey}`, `urn:nil:signing-key:${signingKey}`],
  });
}
