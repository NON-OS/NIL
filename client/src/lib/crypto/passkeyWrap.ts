import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

interface PasskeyContext {
  userId: string;
  workspaceKey: string;
  credentialId: string;
}

const INFO = 'nil/passkey-wrap/v1';
const aad = ({ userId, workspaceKey, credentialId }: PasskeyContext) => utf8ToBytes(`${INFO}|${userId}|${workspaceKey}|${credentialId}`);

function kek(prf: Uint8Array) {
  if (prf.length !== 32) throw new Error('Your passkey gave an answer Nil can’t use.');
  return hkdf(sha256, prf, undefined, utf8ToBytes(INFO), 32);
}

// The identity seed sealed for one passkey (AES-256-GCM). The key comes from that passkey's PRF
// output for a salt stored with the wrap; the output never leaves the browser. The additional
// data ties the wrap to one account, one workspace key and one passkey, so the server can't pass
// it off as someone else's or swap two passkeys' wraps.
const passkeyWrap = {
  async seal(seed: Uint8Array, prf: Uint8Array, context: PasskeyContext) {
    const key = kek(prf);
    try {
      return b64u.encode(await aesGcm.seal(key, seed, aad(context)));
    } finally {
      key.fill(0);
    }
  },

  async open(wrapped: string, prf: Uint8Array, context: PasskeyContext) {
    const key = kek(prf);
    try {
      return await aesGcm.open(key, b64u.decode(wrapped), aad(context));
    } finally {
      key.fill(0);
    }
  },
};

export default passkeyWrap;
