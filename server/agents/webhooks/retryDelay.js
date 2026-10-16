import config from '../../config.js';

const CAP_MS = 6 * 60 * 60_000;

// Exponential backoff with jitter after the nth failed attempt: the base doubles each time up to
// six hours, and the wait is somewhere between half and all of it, so a receiver coming back up
// isn't hit by every queued delivery in the same second.
export default function retryDelay(attempt, random = Math.random) {
  const ceiling = Math.min(CAP_MS, config.agents.webhookBackoffMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
