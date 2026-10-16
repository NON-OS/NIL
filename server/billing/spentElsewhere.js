import sql from '../db/sql.js';

// Whether a transaction already pays a bounty here. One transaction pays exactly one thing.
export default function spentElsewhere(txHash) {
  return Boolean(sql.get('SELECT 1 FROM payments WHERE tx_hash = ?', txHash));
}
