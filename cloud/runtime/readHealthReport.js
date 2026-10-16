// The body of a workspace's /healthz, read from inside the workspace and so untrusted: only a
// few small, typed values are kept. The app reports its version and database schema; a member
// count is used if a future app version reports one. Nothing else about a team is learned here.
export default function readHealthReport(text) {
  if (typeof text !== 'string' || text.length > 4096) return null;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  const report = { ok: body.ok === true };
  if (typeof body.version === 'string' && /^[\w.+-]{1,32}$/.test(body.version)) report.version = body.version;
  if (Number.isSafeInteger(body.schema) && body.schema >= 0) report.schema = body.schema;
  if (Number.isSafeInteger(body.members) && body.members >= 0 && body.members < 1e7) report.members = body.members;
  return report;
}
