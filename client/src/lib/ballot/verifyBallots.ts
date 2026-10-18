import { addPoint } from '@zk-kit/baby-jubjub';
import canonicalNumber from './canonicalNumber';
import voteScope from './voteScope';
import fieldHash from '../semaphore/fieldHash';
import verifyBallotProof from './verifyBallotProof';
import type Point from './point';

// public signals: merkleRoot, nullifier, c1[8][2], c2[8][2], scope, optionCount, publicKey[2]
const OPTIONS = 8;
const SIGNALS = 2 + 4 * OPTIONS + 4;
const ZERO: [bigint, bigint] = [0n, 1n];
const refuse = (why: string) => new Error(`A ballot the server sent ${why}, so Nil won’t decrypt anything. Tell your admin.`);

type Vote = { id: string; optionCount: number; publicKey: Point; roots: string[] };
type Sum = { c1: Point; c2: Point };
const same = (a: Sum[], b: Sum[]) => a.length === b.length && a.every((s, k) => s.c1.join() === b[k]?.c1?.join() && s.c2.join() === b[k]?.c2?.join());

// Checks every ballot of a closed encrypted vote and adds them up, as the server should have:
// each proof against the ballot circuit's key, for this vote's scope, its options and the key
// this browser rebuilt from the trustees' signed dealings, against one of the vote's roots, and
// each nullifier once. The sums the server asks the trustee to decrypt, `claimed`, must be
// exactly these, one per option. Returns them. Throws at the first thing that doesn't check out,
// so a trustee decrypts a sum of valid ballots or nothing at all.
export default async function verifyBallots(vote: Vote, ballots: { publicSignals: unknown; proof: unknown }[], claimed: Sum[]): Promise<Sum[]> {
  const scope = fieldHash(voteScope(vote.id)).toString();
  const seen = new Set<string>();
  const sums = Array.from({ length: vote.optionCount }, () => ({ c1: ZERO, c2: ZERO }));
  for (const ballot of ballots) {
    const s = ballot?.publicSignals;
    if (!Array.isArray(s) || s.length !== SIGNALS || !s.every((v) => canonicalNumber(v) !== null)) throw refuse('is malformed');
    const [scopeOf, optionCount, keyX, keyY] = (s as string[]).slice(2 + 4 * OPTIONS);
    if (scopeOf !== scope || optionCount !== String(vote.optionCount) || keyX !== vote.publicKey[0] || keyY !== vote.publicKey[1]) throw refuse('was made for another vote, other options or another key');
    if (!vote.roots.includes(s[0])) throw refuse('was proven against a voter list this vote never had');
    if (seen.has(s[1])) throw refuse('appears twice');
    seen.add(s[1]);
    if (!(await verifyBallotProof(s, ballot.proof))) throw refuse('has a proof that doesn’t verify');
    for (let k = 0; k < vote.optionCount; k++) {
      sums[k] = {
        c1: addPoint(sums[k].c1, [BigInt(s[2 + 2 * k]), BigInt(s[3 + 2 * k])]) as [bigint, bigint],
        c2: addPoint(sums[k].c2, [BigInt(s[2 + 2 * OPTIONS + 2 * k]), BigInt(s[3 + 2 * OPTIONS + 2 * k])]) as [bigint, bigint],
      };
    }
  }
  const result = sums.map((sum) => ({ c1: sum.c1.map(String) as Point, c2: sum.c2.map(String) as Point }));
  if (!same(result, claimed)) throw new Error('The sums the server asks you to decrypt aren’t the sums of its ballots, so Nil won’t decrypt them. Tell your admin.');
  return result;
}
