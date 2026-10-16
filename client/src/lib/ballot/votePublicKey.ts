import { addPoint } from '@zk-kit/baby-jubjub';
import curvePoint from './curvePoint';
import checkKnowledge from './checkKnowledge';
import type Point from './point';

type Revealed = { commitments: unknown[]; proofs: { t: unknown; z: unknown }[] } | null;

// The vote key rebuilt from the trustees' published commitments: every proof of knowledge has to
// hold, and the key is the sum of the three A0s. Ballots are encrypted to this, never to the
// server's copy. Returns null if any trustee's reveal is missing or doesn't check out.
export default function votePublicKey(proposalId: string, revealed: Revealed[]): Point | null {
  if (revealed.length !== 3) return null;
  let key: [bigint, bigint] = [0n, 1n];
  for (let i = 0; i < revealed.length; i++) {
    const r = revealed[i];
    const points = Array.isArray(r?.commitments) && r.commitments.length === 2 ? r.commitments.map(curvePoint) : null;
    if (!r || !points || points.some((p) => !p) || !Array.isArray(r.proofs)) return null;
    if (!points.every((p, k) => checkKnowledge(proposalId, i + 1, k, p!, r.proofs[k]))) return null;
    key = addPoint(key, points[0]!) as [bigint, bigint];
  }
  return key.map(String) as Point;
}
