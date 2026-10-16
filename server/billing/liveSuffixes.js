import sql from '../db/sql.js';
import config from '../config.js';

const DAY = 86_400_000;

// Suffixes the treasury is still being watched for: every invoice until its late window ends,
// whatever its status, so a late or repeated payment can only ever match the invoice it was for.
export default function liveSuffixes(now = Date.now()) {
  const since = now - config.billing.lateDays * DAY;
  return new Set(sql.all('SELECT suffix FROM billing_invoices WHERE expires_at > ?', since).map((r) => r.suffix));
}
