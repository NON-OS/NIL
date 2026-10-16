// The body of a workspace's /healthz, read from inside the workspace and so untrusted: only
// small numbers and booleans are kept. Today the app answers {"ok":true}; a member count is
// used when the app reports one, which is all the control plane ever learns about a team.
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
  if (Number.isSafeInteger(body.members) && body.members >= 0 && body.members < 1e7) report.members = body.members;
  return report;
}
