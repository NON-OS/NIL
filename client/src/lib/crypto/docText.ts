import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

const aad = (docId: string, field: 'title' | 'body') => utf8ToBytes(`nonos/doc/${docId}/${field}`);

// Encrypts and decrypts a doc's title or body with that doc's key.
const docText = {
  async seal(docKey: Uint8Array, docId: string, field: 'title' | 'body', text: string) {
    return b64u.encode(await aesGcm.seal(docKey, new TextEncoder().encode(text), aad(docId, field)));
  },

  async open(docKey: Uint8Array, docId: string, field: 'title' | 'body', blob: string) {
    return new TextDecoder().decode(await aesGcm.open(docKey, b64u.decode(blob), aad(docId, field)));
  },
};

export default docText;
