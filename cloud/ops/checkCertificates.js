import readCertificate from './readCertificate.js';

const DAY = 86_400_000;
// a reserved name, so never a workspace; under the wildcard it gets the same certificate as all
const PROBE = 'health';

// Hourly: Caddy renews the certificates by itself, and nothing else would notice if it stopped,
// say because the DNS token for the wildcard was revoked, until visitors got a certificate
// error. This connects like a visitor to the sign-up host and, with the wildcard, to a name
// under it, and alerts when fewer than CLOUD_CERT_WARN_DAYS are left (critical under
// CLOUD_CERT_CRITICAL_DAYS) or when the certificate doesn't verify at all. With on-demand
// certificates the workspaces' own ones aren't checked: asking for one is what makes Caddy get
// or renew it, so a check would only trigger what it means to watch.
export default async function checkCertificates(ctx, { port = 443, ca, now = Date.now() } = {}) {
  const { domain, signupHost, caddy, certs } = ctx.config;
  if (!certs.warnDays) return [];
  const names = [signupHost, ...(caddy.tls === 'wildcard' ? [`${PROBE}.${domain}`] : [])];
  const results = [];
  for (const name of names) {
    try {
      const { validTo } = await readCertificate(name, { address: certs.checkAddress ?? name, port, ca });
      results.push({ name, validTo, daysLeft: Math.floor((validTo - now) / DAY) });
    } catch (err) {
      results.push({ name, error: err.code ?? err.message });
    }
  }

  const where = caddy.tls === 'wildcard' ? 'Check Caddy’s log (docker compose logs caddy) and that its DNS token still works.' : 'Check Caddy’s log (docker compose logs caddy).';
  const list = (rows) => rows.map((r) => `${r.name} on ${r.validTo.toISOString().slice(0, 10)}, in ${r.daysLeft} days`).join('; ');
  const broken = results.filter((r) => r.error);
  const soon = results.filter((r) => !r.error && r.daysLeft < certs.criticalDays);
  const later = results.filter((r) => !r.error && r.daysLeft >= certs.criticalDays && r.daysLeft < certs.warnDays);
  if (broken.length) {
    await ctx.alert('tls.certificate_invalid', { severity: 'critical', repeatMin: 6 * 60, message: `Visitors get a certificate error: ${broken.map((r) => `${r.name} (${r.error})`).join('; ')}. ${where}` });
  }
  if (soon.length) {
    await ctx.alert('tls.certificate_expiring_soon', { severity: 'critical', repeatMin: 6 * 60, message: `Certificates expire within ${certs.criticalDays} days: ${list(soon)}. Caddy renews with a third of a certificate’s life left, so renewal has been failing for a while. ${where}` });
  }
  if (later.length) {
    await ctx.alert('tls.certificate_expiring', { repeatMin: 24 * 60, message: `Certificates expire within ${certs.warnDays} days: ${list(later)}. Caddy should have renewed them by now. ${where}` });
  }
  return results;
}
