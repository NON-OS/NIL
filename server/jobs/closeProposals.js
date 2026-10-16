import sql from '../db/sql.js';
import logLimited from '../lib/logLimited.js';
import closeProposal from '../services/closeProposal.js';

// Runs every minute and closes votes whose time is up. One that can't be closed is tried again
// on the next run. Stops between votes when the server is shutting down.
export default async function closeProposals(signal) {
  for (const { id } of sql.all('SELECT id FROM proposals WHERE closed_at IS NULL AND closes_at <= ?', Date.now())) {
    if (signal?.aborted) return;
    await closeProposal(id).catch((err) => logLimited('votes:close', 'error', 'votes', `Couldn’t close vote ${id}. It will be retried.`, err));
  }
}
