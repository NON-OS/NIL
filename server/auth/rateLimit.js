import clientKey from './clientKey.js';

// Fixed-window limiter kept in memory. Fine for a single instance; use a shared store if you scale out.
export default function rateLimit({ windowMs, max, key = (req) => clientKey(req.ip), message = 'Too many attempts. Wait a few minutes and try again.' }) {
  const buckets = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let bucket = buckets.get(k);
    if (!bucket || bucket.reset < now) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(k, bucket);
    }
    if (++bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
