import http from '../api/http';
import store from '../state/store';
import ethereum from '../lib/ethereum';
import b64u from '../lib/crypto/b64u';
import keyStatement from '../lib/crypto/keyStatement';
import type Identity from '../types/Identity';
import type { Wrap } from './walletWraps';

// Publishes an identity's public keys with a statement the wallet signs for this site, workspace
// and account, so teammates' browsers can check the keys are really this member's. A reset or a
// first publication carries the wrap for that wallet, so the new keys can be opened again.
export default async function publishKeys(identity: Identity, address: string, { reset = false, wrap }: { reset?: boolean; wrap?: Wrap } = {}) {
  const s = store.get();
  const fields = { publicKey: b64u.encode(identity.publicKey), signingKey: b64u.encode(identity.signingKey), createdAt: Date.now(), address };
  const signature = await ethereum.sign(keyStatement({ origin: s.origin, workspaceKey: s.workspaceKey, userId: s.me!.id, ...fields }), address);
  await http.put('/me/encryption-key', { ...fields, signature, reset, ...(wrap ? { wrap } : {}) });
}
