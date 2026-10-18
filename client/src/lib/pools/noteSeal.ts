import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from '../crypto/aesGcm';
import b64u from '../crypto/b64u';
import type PoolBook from '../../types/PoolBook';

const derive = (key: Uint8Array, label: string, length: number) => hkdf(sha256, key, utf8ToBytes('nil/privacy-pools/v1'), utf8ToBytes(label), length);

// The team's notes travel only encrypted under a key derived from the pool key (AES-256-GCM),
// bound to the key's public tag. The tag names the pool key without revealing it, so browsers
// can tell that the key they opened is the one the notes belong to.
const noteSeal = {
  tag: (key: Uint8Array) => bytesToHex(derive(key, 'key tag', 16)),

  async seal(key: Uint8Array, book: PoolBook) {
    const tag = utf8ToBytes(noteSeal.tag(key));
    return b64u.encode(await aesGcm.seal(derive(key, 'notes', 32), utf8ToBytes(JSON.stringify(book)), tag));
  },

  async open(key: Uint8Array, sealed: string): Promise<PoolBook> {
    const tag = utf8ToBytes(noteSeal.tag(key));
    const plain = await aesGcm.open(derive(key, 'notes', 32), b64u.decode(sealed), tag).catch(() => {
      throw new Error('The team’s pool notes don’t open with this pool key.');
    });
    const book = JSON.parse(new TextDecoder().decode(plain));
    if (book?.v !== 1 || !Array.isArray(book.notes)) throw new Error('The team’s pool notes are in a format this version of Nil doesn’t know.');
    return book;
  },
};

export default noteSeal;
