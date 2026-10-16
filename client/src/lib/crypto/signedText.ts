import { ed25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@noble/hashes/utils';
import b64u from './b64u';

export interface Signed {
  by: string;
  text: string;
  sig: string;
}

// The signature covers where the text belongs (`context`: which doc, field and version, or which
// task), who wrote it and the text itself.
const message = (context: string, by: string, text: string) => utf8ToBytes(`nil/signed/v1\n${context}\n${by}\n${text}`);

// Text with its author's Ed25519 signature, as the JSON that then gets encrypted. Anyone can
// seal a key to a member's public key, so encryption alone doesn't say who wrote something; the
// signature does, and the server holds no member's signing key to forge one.
const signedText = {
  seal(text: string, { context, by, signingPrivate }: { context: string; by: string; signingPrivate: Uint8Array }) {
    return JSON.stringify({ by, text, sig: b64u.encode(ed25519.sign(message(context, by, text), signingPrivate)) });
  },

  open(json: string): Signed {
    const value = JSON.parse(json);
    if (typeof value?.by !== 'string' || typeof value.text !== 'string' || typeof value.sig !== 'string') throw new Error('This text isn’t signed.');
    return { by: value.by, text: value.text, sig: value.sig };
  },

  verify(signed: Signed, context: string, signingKey: Uint8Array) {
    try {
      return ed25519.verify(b64u.decode(signed.sig), message(context, signed.by, signed.text), signingKey);
    } catch {
      return false;
    }
  },
};

export default signedText;
