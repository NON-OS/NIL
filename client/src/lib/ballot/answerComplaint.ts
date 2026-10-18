import { subOrder } from '@zk-kit/baby-jubjub';
import dealingLine from './dealingLine';
import trusteeStatement from './trusteeStatement';
import trusteeSignature from './trusteeSignature';
import type Signer from './signer';

// A dealer's answer to a complaint about the share they dealt seat `accuser`: that share, f(accuser),
// in the open and signed, so the server and every browser can check it against the dealer's
// commitments. Each answer makes one share public, so only a complaint signed with the key
// pinned for its trustee gets one; anything else is the server's doing, and this throws.
export default function answerComplaint(proposalId: string, position: number, me: { userId: string; seed: Uint8Array; signingPrivate: Uint8Array }, complaint: { accuser: number; signature: string }, accuser: Signer) {
  const statement = accuser && trusteeStatement.complaint(proposalId, complaint.accuser, accuser.userId, position);
  if (!accuser || !statement || !trusteeSignature.verify(complaint.signature, statement, accuser.signingKey)) {
    throw new Error(`The complaint said to come from trustee ${complaint.accuser} isn’t signed with the key this browser knows for them, so Nil won’t answer it. Tell your admin.`);
  }
  const [a0, a1] = dealingLine(me.seed, proposalId, position);
  const share = ((a0 + a1 * BigInt(complaint.accuser)) % subOrder).toString();
  return { to: complaint.accuser, share, signature: trusteeSignature.sign(trusteeStatement.answer(proposalId, position, me.userId, complaint.accuser, share), me.signingPrivate) };
}
