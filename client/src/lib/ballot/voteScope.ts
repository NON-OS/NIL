import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

// The scope of one anonymous vote, worked out here instead of taken from the server. Must match
// server/votes/voteScope.js: the first 31 bytes of SHA-256 over the vote's id.
export default function voteScope(proposalId: string) {
  return BigInt(`0x${bytesToHex(sha256(utf8ToBytes(`nonos/vote/${proposalId}`))).slice(0, 62)}`).toString();
}
