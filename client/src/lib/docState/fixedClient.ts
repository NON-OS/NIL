import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

// A Yjs client id every browser derives the same way from a doc and version, for changes that
// several tabs may make independently and must agree on byte for byte.
export default function fixedClient(docId: string, version: number) {
  const h = sha256(utf8ToBytes(`nil/doc-client/${docId}/${version}`));
  return ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
}
