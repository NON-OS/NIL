import crypto from 'node:crypto';
import signingKey from '../proofs/signingKey.js';

// The Semaphore scope of one AI credit: one slot of one UTC day in this workspace. A member's
// nullifier is tied to it, so each slot can be spent once a day, and nullifiers from different
// slots, days, workspaces or votes can't be matched to each other. Every input is the same for
// every member, so the scope can't single anyone out. 31 bytes keeps it inside the field.
export default function creditScope(day, slot) {
  const text = `nil/ai-credit/v1|scope|${signingKey.publicKey()}|${day}|${slot}`;
  return BigInt(`0x${crypto.createHash('sha256').update(text).digest('hex').slice(0, 62)}`).toString();
}
