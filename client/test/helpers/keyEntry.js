import wallet from '../../../server/test/helpers/wallet.js';
import b64u from '../../src/lib/crypto/b64u.ts';
import keyStatement from '../../src/lib/crypto/keyStatement.ts';

// A key directory entry for `identity`, signed by a wallet for this site and workspace key the
// way a member (or a server's own wallet) would publish it.
export default function keyEntry(userId, identity, { origin = 'https://nil.example', workspaceKey = 'workspace-key-abc', signer = wallet() } = {}) {
  const fields = { userId, publicKey: b64u.encode(identity.publicKey), signingKey: b64u.encode(identity.signingKey), createdAt: Date.now(), address: signer.address, active: true };
  return { ...fields, signature: signer.sign(keyStatement({ origin, workspaceKey, ...fields })) };
}
