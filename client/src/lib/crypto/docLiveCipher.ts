import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';
import sizePad from './sizePad';

export type LiveKind = 'update' | 'aware';

const ID_BYTES = 16;
// the IV in front of each AES-GCM ciphertext and the tag behind it
const OVERHEAD = 28;
const aad = (docId: string, kind: LiveKind, id: string) => utf8ToBytes(`nil/doc/${docId}/${kind}/${id}`);

// A live change to a doc, or someone's cursor in it, sealed with the doc key. Each carries a
// random id in front of the ciphertext, and the id, the doc and the kind are the additional data,
// so the server can't move one between docs or pass a cursor off as a change. What's inside is
// padded first, so the size of a change doesn't tell how much was typed.
const docLiveCipher = {
  newId: () => b64u.encode(crypto.getRandomValues(new Uint8Array(ID_BYTES))),

  async seal(key: Uint8Array, docId: string, kind: LiveKind, id: string, payload: Uint8Array) {
    const idBytes = b64u.decode(id);
    if (idBytes.length !== ID_BYTES) throw new Error('A live change needs a 16-byte id.');
    const sealed = await aesGcm.seal(key, sizePad.pad(payload), aad(docId, kind, id));
    const out = new Uint8Array(ID_BYTES + sealed.length);
    out.set(idBytes);
    out.set(sealed, ID_BYTES);
    return b64u.encode(out);
  },

  async open(key: Uint8Array, docId: string, kind: LiveKind, ct: string) {
    const all = b64u.decode(ct);
    if (all.length < ID_BYTES + OVERHEAD) throw new Error('That live change is too short to be one.');
    const id = b64u.encode(all.subarray(0, ID_BYTES));
    return { id, payload: sizePad.unpad(await aesGcm.open(key, all.subarray(ID_BYTES), aad(docId, kind, id))) };
  },
};

export default docLiveCipher;
