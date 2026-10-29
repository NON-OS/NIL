import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes } from '@noble/hashes/utils';

// A file's own key is the key of its blob, which uses it with nonces of its own (see
// blobCipher). Its thumbnail and the list of its chunks' hashes each get a key derived from it
// instead, and its sealed details one derived from it and the folder key together (`folderKey`),
// so someone who kept a file's key after being taken out of the folder can't write details
// anyone accepts. Format 1 details used the file's key alone. No two kinds of ciphertext share a
// key.
export default function itemSubkey(itemKey: Uint8Array, use: 'meta' | 'thumb' | 'hashes', folderKey?: Uint8Array) {
  if (folderKey) return hkdf(sha256, concatBytes(folderKey, itemKey), undefined, `nil/folder-item/${use}/v2`, 32);
  return hkdf(sha256, itemKey, undefined, `nil/folder-item/${use}/v1`, 32);
}
