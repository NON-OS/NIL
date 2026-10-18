import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import poolFetch from './poolFetch.js';
import fieldList from './fieldList.js';

const KNOWN = new Set(['pending', 'approved', 'declined', 'poi_required', 'exited', 'spent']);

// What the association set provider decided about some of the team's deposits, by label. The
// provider already sees who made every deposit (deposits are public), so asking about the
// team's labels together tells it nothing new about the team; it never learns where a
// withdrawal went. Labels it doesn't know come back as "unknown".
export default async function reviewStatuses(found, labels) {
  const asked = fieldList(labels, 100);
  if (!asked || !asked.length) throw HttpError.badRequest('Name up to 100 deposit labels to check.');
  const res = await poolFetch('asp', `/${config.pools.chainId}/public/deposits-by-label`, { headers: { 'X-Pool-Scope': found.scope.toString(), 'X-Labels': asked.join(',') } });
  if (!res.ok) throw new HttpError(502, 'The association set provider couldn’t answer just now. Try again in a minute.');
  const rows = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.deposits) ? res.data.deposits : [];
  const byLabel = new Map();
  for (const row of rows) {
    const label = typeof row?.label === 'string' && /^\d+$/.test(row.label) ? BigInt(row.label).toString() : null;
    const raw = row?.reviewStatus;
    const status = String((raw && typeof raw === 'object' ? raw.decisionStatus ?? raw.reviewStatus ?? raw.status : raw) ?? '').toLowerCase();
    if (label) byLabel.set(label, KNOWN.has(status) ? status : 'unknown');
  }
  return asked.map((label) => ({ label, status: byLabel.get(label) ?? 'unknown' }));
}
