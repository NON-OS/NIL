import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const SELECTOR = bytesToHex(keccak_256(utf8ToBytes('relay((address,bytes),(uint256[2],uint256[2][2],uint256[2],uint256[8]),uint256)'))).slice(0, 8);
const word = (n) => BigInt(n).toString(16).padStart(64, '0');

// Call data for Entrypoint.relay(withdrawal, proof, scope), as a relayer sends it. The proof is
// a static tuple laid out in the head (16 words, the second point's pairs swapped for the
// verifier); the withdrawal, which holds bytes, sits after it.
export default function relayCall({ processooor, data }, { proof, publicSignals }, scope) {
  const b = proof.pi_b;
  const fixed = [proof.pi_a[0], proof.pi_a[1], b[0][1], b[0][0], b[1][1], b[1][0], proof.pi_c[0], proof.pi_c[1], ...publicSignals].map(word).join('');
  const bytes = data.replace(/^0x/, '');
  const tail = `${processooor.replace(/^0x/, '').toLowerCase().padStart(64, '0')}${word(0x40)}${word(bytes.length / 2)}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0')}`;
  return `0x${SELECTOR}${word(18 * 32)}${fixed}${word(scope)}${tail}`;
}
