import clientKey from './clientKey.js';
import networkKeys from './networkKeys.js';

// Fixed-window limiter kept in memory. Fine for a single instance; use a shared store if you scale out.
// Limits by address (the default) also count each IPv6 request toward its /56 and /48, so moving
// between the /64s of one network doesn't buy a fresh allowance each time.
export default function rateLimit({ windowMs, max, key, message = 'Too many attempts. Wait a few minutes and try again.' }) {
  const buckets = new Map();
  const keysOf = key ? (req) => [{ key: key(req), times: 1 }] : (req) => [{ key: clientKey(req.ip), times: 1 }, ...networkKeys(req.ip)];

  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    let over = null;
    for (const { key: k, times } of keysOf(req)) {
      let bucket = buckets.get(k);
      if (!bucket || bucket.reset < now) {
        bucket = { count: 0, reset: now + windowMs };
        buckets.set(k, bucket);
      }
      if (++bucket.count > max * times) over = bucket;
    }
    if (over) {
      res.setHeader('Retry-After', Math.ceil((over.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
