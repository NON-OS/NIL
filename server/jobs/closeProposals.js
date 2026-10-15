import sql from '../db/sql.js';
import closeProposal from '../services/closeProposal.js';

// Runs every minute and closes votes whose time is up.
export default async function closeProposals() {
  for (const { id } of sql.all('SELECT id FROM proposals WHERE closed_at IS NULL AND closes_at <= ?', Date.now())) {
    await closeProposal(id).catch((err) => console.error('[votes] could not close', id, err.message));
  }
}
