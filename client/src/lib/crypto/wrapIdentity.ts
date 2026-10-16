import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';
import signatureSecret from './signatureSecret';

interface WrapContext {
  userId: string;
  address: string;
}

const aad = ({ userId, address }: WrapContext) => utf8ToBytes(`nil/identity-wrap/v1|${userId}|${address.toLowerCase()}`);
const kek = (signature: string) => signatureSecret(signature, 'identity wrapping key');

// The identity seed sealed for one wallet (AES-256-GCM). The key comes from that wallet's
// signature of its unlock message, which never leaves the browser; the additional data ties the
// wrap to one account and one wallet so the server can't pass it off as someone else's.
const wrapIdentity = {
  async seal(seed: Uint8Array, signature: string, context: WrapContext) {
    return b64u.encode(await aesGcm.seal(kek(signature), seed, aad(context)));
  },

  async open(wrapped: string, signature: string, context: WrapContext) {
    return aesGcm.open(kek(signature), b64u.decode(wrapped), aad(context));
  },
};

export default wrapIdentity;
