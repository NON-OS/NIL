import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const point = (p: [string, string] | [bigint, bigint]) => `${p[0]},${p[1]}`;

// What a trustee signs at each step of an encrypted vote's key setup, with the signing key
// teammates pinned for them. Must match server/votes/encrypted/trusteeStatement.js byte for byte.
const trusteeStatement = {
  commit: (proposalId: string, position: number, userId: string, commitment: string) => `nil/trustee-commit/v1\n${proposalId}\n${position}\n${userId}\n${commitment}`,

  reveal: (proposalId: string, position: number, userId: string, commitments: ([string, string] | [bigint, bigint])[], sharesDigest: string) =>
    `nil/trustee-reveal/v1\n${proposalId}\n${position}\n${userId}\n${commitments.map(point).join('\n')}\n${sharesDigest}`,

  complaint: (proposalId: string, position: number, userId: string, dealer: number) => `nil/trustee-complaint/v1\n${proposalId}\n${position}\n${userId}\n${dealer}`,

  answer: (proposalId: string, position: number, userId: string, accuser: number, share: string) => `nil/trustee-answer/v1\n${proposalId}\n${position}\n${userId}\n${accuser}\n${share}`,

  // SHA-256 over the three sealed shares in seat order
  sharesDigest: (shares: Record<number, string>) => bytesToHex(sha256(utf8ToBytes([1, 2, 3].map((j) => shares[j]).join('\n')))),
};

export default trusteeStatement;
