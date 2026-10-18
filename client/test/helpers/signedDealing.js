import dealingCommit from '../../src/lib/ballot/dealingCommit.ts';
import dealShares from '../../src/lib/ballot/dealShares.ts';
import trusteeStatement from '../../src/lib/ballot/trusteeStatement.ts';
import trusteeSignature from '../../src/lib/ballot/trusteeSignature.ts';

const big = (p) => p.map(BigInt);

// What a trustee's browser publishes for a line: the dealing with the shares sealed to
// `recipients`, its commitment hash, and both signed with `signer`'s signing key, the way
// actions/trusteeSetup.ts does it.
export default async function signedDealing(proposalId, position, line, recipients, { userId, signingPrivate }) {
  const d = await dealShares(proposalId, position, line, recipients);
  const commitment = dealingCommit(proposalId, position, d.commitments.map(big));
  const sharesDigest = trusteeStatement.sharesDigest(d.shares);
  return {
    ...d,
    commitment,
    commitSignature: trusteeSignature.sign(trusteeStatement.commit(proposalId, position, userId, commitment), signingPrivate),
    sharesDigest,
    signature: trusteeSignature.sign(trusteeStatement.reveal(proposalId, position, userId, d.commitments, sharesDigest), signingPrivate),
  };
}
