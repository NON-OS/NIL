const PATTERNS = [
  /nonos_(pat|agt)_[\w-]{10,}/g,
  /whsec_[\w-]{10,}/g,
  /sk-ant-[\w-]{10,}/g,
  /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
];

// Scrubs anything shaped like a key or token, plus the given known secrets, from text the runner
// is about to post. A model can be talked into repeating a secret; this keeps it off the task.
export default function redactSecrets(text, known = []) {
  let out = String(text ?? '');
  for (const secret of known.filter((s) => s && s.length >= 8)) out = out.split(secret).join('[redacted]');
  for (const pattern of PATTERNS) out = out.replace(pattern, '[redacted]');
  return out;
}
