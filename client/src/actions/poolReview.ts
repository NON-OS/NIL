import http from '../api/http';
import type PoolBook from '../types/PoolBook';
import type PoolSets from '../types/PoolSets';

export type Review = 'approved' | 'pending' | 'declined' | 'poi_required' | 'exited' | 'spent' | 'unknown';

// Where each of the team's deposits stands with the association set provider, by label. A label
// in the current association set is approved, which is all a private payout needs; the provider
// is asked about the rest, so a declined deposit shows as declined rather than waiting forever.
export default async function poolReview(book: PoolBook, symbols: string[]) {
  const out = new Map<string, Review>();
  for (const symbol of symbols) {
    const labels = book.notes.filter((n) => n.symbol === symbol && n.label && n.state === 'open').map((n) => n.label!);
    if (!labels.length) continue;
    const sets = await http.get<PoolSets>(`/pools/${symbol}/sets`).catch(() => null);
    const approved = new Set(sets?.aspLeaves ?? []);
    const rest = labels.filter((l) => !approved.has(l));
    for (const l of labels.filter((x) => approved.has(x))) out.set(l, 'approved');
    for (let i = 0; i < rest.length; i += 100) {
      const { statuses } = await http.post<{ statuses: { label: string; status: Review }[] }>(`/pools/${symbol}/review`, { labels: rest.slice(i, i + 100) }).catch(() => ({ statuses: [] }));
      for (const s of statuses) out.set(s.label, s.status === 'approved' ? 'pending' : s.status);
    }
  }
  return out;
}
