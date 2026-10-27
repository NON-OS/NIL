import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

// A file's own key is the key of its blob, which uses it with nonces of its own (see
// blobCipher). Its sealed details and its thumbnail each get a key derived from it instead, so no
// two kinds of ciphertext ever share a key.
export default function itemSubkey(itemKey: Uint8Array, use: 'meta' | 'thumb') {
  return hkdf(sha256, itemKey, undefined, `nil/folder-item/${use}/v1`, 32);
}
