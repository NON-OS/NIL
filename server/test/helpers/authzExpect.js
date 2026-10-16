const SIGNED_OUT = new Set(['anon', 'stranger', 'outsider']);

// What one actor should get from one matrix row: allowed, with the statuses that count as
// getting through ("2xx" unless the row says otherwise), or refused, with the refusals that fit.
// Callers without a session (or, on the cookie API, with only an agent key) are refused with
// 401 before any route that needs sign-in; people refused inside the workspace get 403, or a
// 404 where the route hides that the thing exists.
export default function authzExpect(row, actor, { bearer = false } = {}) {
  if (row.allow.includes(actor)) {
    const ok = Array.isArray(row.ok) ? row.ok : row.ok?.[actor];
    return { allowed: true, statuses: ok ?? '2xx' };
  }
  const unauthenticated = SIGNED_OUT.has(actor) || (!bearer && actor.startsWith('agent'));
  if (unauthenticated && !row.open) return { allowed: false, statuses: [401] };
  return { allowed: false, statuses: row.denied ?? [403, 404] };
}
