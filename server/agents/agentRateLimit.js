import config from '../config.js';

const WINDOW_MS = 60_000;
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.reset < now) buckets.delete(key);
}, WINDOW_MS).unref();

// Requests per minute for one caller of the agent endpoints: the agent's own limit from
// Settings → Agents, or the workspace default for personal keys. Fixed one-minute windows kept
// in memory, which is enough for one server per workspace.
export default function agentRateLimit(principal) {
  const max = principal.agent?.limits.rateLimit ?? config.agents.rateLimit;
  const now = Date.now();
  let bucket = buckets.get(principal.key);
  if (!bucket || bucket.reset < now) {
    bucket = { count: 0, reset: now + WINDOW_MS };
    buckets.set(principal.key, bucket);
  }
  bucket.count += 1;
  return { allowed: bucket.count <= max, limit: max, remaining: Math.max(0, max - bucket.count), resetSeconds: Math.ceil((bucket.reset - now) / 1000) };
}
