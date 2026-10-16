import crypto from 'node:crypto';
import checksumAddress from '../lib/checksumAddress.js';

// The message a member's wallet signs to publish their encryption and signing keys. It has the
// shape of Sign-In with Ethereum (EIP-4361) so the wallet shows which site is asking, and its
// resources pin it to one workspace, one account and exactly these two keys. Browsers rebuild
// it byte for byte from the published fields (client/src/lib/crypto/keyStatement.ts) and check
// the signature themselves. The chain is fixed at 1 because the signature has nothing to do
// with any chain. Never change a shipped version: every published key would stop verifying.
export default function keyStatement({ host, origin, address, workspaceKey, userId, publicKey, signingKey, createdAt }) {
  const nonce = crypto.createHash('sha256').update(`${publicKey}${signingKey}`).digest('hex').slice(0, 16);
  return [
    `${host} wants you to sign in with your Ethereum account:`,
    checksumAddress(address),
    '',
    'Publish my Nil encryption keys for this workspace. Teammates use them to share docs, private tasks and vote shares with me. This is not a transaction and costs nothing.',
    '',
    `URI: ${origin}`,
    'Version: 1',
    'Chain ID: 1',
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(createdAt).toISOString()}`,
    'Resources:',
    `- urn:nil:workspace:${workspaceKey}`,
    `- urn:nil:account:${userId}`,
    `- urn:nil:encryption-key:${publicKey}`,
    `- urn:nil:signing-key:${signingKey}`,
  ].join('\n');
}
