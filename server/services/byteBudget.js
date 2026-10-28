// Bytes per key per window, for limits that count size rather than requests. Kept in memory: a
// restart starts every budget afresh, which only ever errs towards letting someone through.
export default function byteBudget(windowMs) {
  const used = new Map();
  return {
    take(key, bytes, limit) {
      const now = Date.now();
      let b = used.get(key);
      if (!b || now - b.start > windowMs) {
        for (const [k, v] of used) if (now - v.start > windowMs) used.delete(k);
        used.set(key, (b = { start: now, bytes: 0 }));
      }
      if (b.bytes + bytes > limit) return false;
      b.bytes += bytes;
      return true;
    },
  };
}
