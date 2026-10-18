import sql from '../db/sql.js';
import config from '../config.js';
import siwe from '../auth/siwe.js';
import walletSignature from '../auth/walletSignature.js';
import headBlock from '../chain/headBlock.js';

const COUNTERFACTUAL = '6492'.repeat(16);

// Which of the voter's own linked wallets signed a ballot, and how that was checked. A plain
// wallet's key is recovered from the signature, which anyone can redo from the audit file alone.
// A smart wallet can only be asked on-chain (EIP-1271 once deployed, EIP-6492 before), so it's
// asked at one block, which its ballot notes for a recount to ask again. Null when the signature
// isn't from a wallet linked to this voter.
export default async function ballotSigner(userId, message, signature, claimed) {
  const linked = new Set(sql.all("SELECT external_id FROM credentials WHERE user_id = ? AND kind = 'wallet'", userId).map((r) => r.external_id));
  const recovered = siwe.recover(message, signature);
  if (recovered && linked.has(recovered)) return { address: recovered, checkedBy: 'ecrecover', block: null };

  const address = String(claimed ?? '').toLowerCase();
  if (!linked.has(address) || !config.nox.enabled) return null;
  const block = await headBlock();
  try {
    await walletSignature(address, message, signature, { block });
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
  return { address, checkedBy: signature.toLowerCase().endsWith(COUNTERFACTUAL) ? 'eip6492' : 'eip1271', block };
}
