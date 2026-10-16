import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

export interface DocPlace {
  docId: string;
  field: 'title' | 'body';
  version: number;
}

// Which doc, which field and which version a ciphertext is. It's the additional data, so the
// server can't move text between docs or fields, or pass an old version off under a newer
// number; and it's the context of the author's signature inside.
const place = ({ docId, field, version }: DocPlace) => `nil/doc/${docId}/${field}/v${version}`;

// Encrypts and decrypts one field of one version of a doc with that doc's key.
const docText = {
  context: place,

  async seal(docKey: Uint8Array, at: DocPlace, payload: string) {
    return b64u.encode(await aesGcm.seal(docKey, new TextEncoder().encode(payload), utf8ToBytes(place(at))));
  },

  async open(docKey: Uint8Array, at: DocPlace, blob: string) {
    return new TextDecoder().decode(await aesGcm.open(docKey, b64u.decode(blob), utf8ToBytes(place(at))));
  },
};

export default docText;
