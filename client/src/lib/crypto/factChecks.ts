// The shapes a signed fact may take. Another member's browser wrote them, so each is checked
// before anything relies on it.
const factChecks = {
  // a moment in milliseconds, as Date.now() gives it
  time: (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0,
  count: (v: unknown, below: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < below,
  person: (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64,
  // a key hash or a content hash: 32 bytes as base64url
  hash: (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v),
};

export default factChecks;
