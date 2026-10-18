// What the verifier reports on GET /healthz, for Docker, the operator and anyone on the chain
// network: whether it can answer with proof right now, and if not why. Times only; never a
// request, an address or the nodes it talks to.
export default function verifierHealth(state, config, now = Date.now()) {
  const headAgeSeconds = state.headAt ? Math.max(0, Math.round((now - state.headAt) / 1000)) : null;
  const fresh = headAgeSeconds !== null && headAgeSeconds * 1000 <= config.maxHeadAgeMs;
  const ok = state.phase === 'ready' && fresh;
  return {
    ok,
    network: config.network,
    reason: ok ? null : state.phase === 'ready' ? 'syncing' : state.reason,
    headAgeSeconds,
    checkpointAgeDays: state.checkpointAgeMs === undefined ? null : Math.floor(state.checkpointAgeMs / 86_400_000),
  };
}
