// A fixed-window counter per key, in memory. Sign-up runs in one process, and keeping the
// counters in memory means visitors' IP addresses are never written to disk.
export default function createLimiter({ windowMs, max, now = Date.now, maxKeys = 100_000 }) {
  const buckets = new Map();

  function prune() {
    const t = now();
    for (const [key, bucket] of buckets) if (bucket.reset <= t) buckets.delete(key);
    // under a flood of distinct keys, the oldest go first (Maps keep insertion order)
    while (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value);
  }

  return {
    hit(key) {
      const t = now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.reset <= t) {
        if (buckets.size >= maxKeys) prune();
        bucket = { count: 0, reset: t + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count++;
      if (bucket.count > max) return { ok: false, retryAfterSec: Math.ceil((bucket.reset - t) / 1000) };
      return { ok: true };
    },
    prune,
    size: () => buckets.size,
  };
}
