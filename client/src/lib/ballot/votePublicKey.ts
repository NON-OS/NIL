import { addPoint } from '@zk-kit/baby-jubjub';
import curvePoint from './curvePoint';
import checkKnowledge from './checkKnowledge';
import dealingCommit from './dealingCommit';
import trusteeStatement from './trusteeStatement';
import trusteeSignature from './trusteeSignature';
import type Point from './point';
import type Signer from './signer';

type Revealed = { commitment?: unknown; commitSignature?: unknown; commitments: unknown[]; proofs: { t: unknown; z: unknown }[]; sharesDigest?: unknown; signature?: unknown } | null;

// The vote key rebuilt from the trustees' published dealings. Each seat's commitment hash and
// dealing must be signed by the key this browser pinned for the trustee in that seat, the hash
// must be of those commitments, and every proof of knowledge has to hold; the key is then the
// sum of the three A0s. Ballots are encrypted to this, never to the server's copy. A server that
// dealt a seat itself can't sign for its trustee. Returns null if any of it doesn't check out.
export default function votePublicKey(proposalId: string, revealed: Revealed[], signers?: Signer[]): Point | null {
  if (revealed.length !== 3 || signers?.length !== 3) return null;
  let key: [bigint, bigint] = [0n, 1n];
  for (let i = 0; i < revealed.length; i++) {
    const r = revealed[i];
    const signer = signers[i];
    const position = i + 1;
    const points = Array.isArray(r?.commitments) && r.commitments.length === 2 ? r.commitments.map(curvePoint) : null;
    if (!r || !signer || !points || points.some((p) => !p) || !Array.isArray(r.proofs)) return null;
    if (!points.every((p, k) => checkKnowledge(proposalId, position, k, p!, r.proofs[k]))) return null;
    const commitments = points as [bigint, bigint][];
    if (typeof r.commitment !== 'string' || dealingCommit(proposalId, position, commitments) !== r.commitment) return null;
    if (!trusteeSignature.verify(r.commitSignature, trusteeStatement.commit(proposalId, position, signer.userId, r.commitment), signer.signingKey)) return null;
    if (typeof r.sharesDigest !== 'string' || !trusteeSignature.verify(r.signature, trusteeStatement.reveal(proposalId, position, signer.userId, commitments, r.sharesDigest), signer.signingKey)) return null;
    key = addPoint(key, commitments[0]) as [bigint, bigint];
  }
  return key.map(String) as Point;
}
