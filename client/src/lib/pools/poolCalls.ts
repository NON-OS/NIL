import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const selector = (signature: string) => bytesToHex(keccak_256(utf8ToBytes(signature))).slice(0, 8);
const word = (n: bigint | string) => BigInt(n).toString(16).padStart(64, '0');
const address = (a: string) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const DEPOSIT = selector('deposit(address,uint256,uint256)');
const RAGEQUIT = selector('ragequit((uint256[2],uint256[2][2],uint256[2],uint256[4]))');

interface Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}

// Call data for what the team's wallet sends to Privacy Pools itself: approving the entry
// contract for the token, the deposit, and a ragequit. Withdrawals go through the relayer.
// A proof's second point goes in with each pair swapped, the order the Solidity verifier takes.
const poolCalls = {
  approve: (spender: string, amount: bigint) => `0x095ea7b3${address(spender)}${word(amount)}`,
  deposit: (asset: string, value: bigint, precommitment: bigint) => `0x${DEPOSIT}${address(asset)}${word(value)}${word(precommitment)}`,
  ragequit({ proof, publicSignals }: { proof: Proof; publicSignals: string[] }) {
    const b = proof.pi_b;
    const words = [proof.pi_a[0], proof.pi_a[1], b[0][1], b[0][0], b[1][1], b[1][0], proof.pi_c[0], proof.pi_c[1], ...publicSignals];
    return `0x${RAGEQUIT}${words.map(word).join('')}`;
  },
};

export default poolCalls;
