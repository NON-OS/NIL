// What the calls check reads from a page: waits, and each live peer connection's state and path.
const until = async (what, fn, ms = 30_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

// each live peer connection's state and the kind of path it took
const links = (page) =>
  page.evaluate(async () => {
    const out = [];
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue;
      const stats = await pc.getStats();
      // Chromium and WebKit name the pair in use on the transport; Firefox marks it selected
      let pair = null;
      stats.forEach((s) => {
        if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
      });
      stats.forEach((s) => {
        if (!pair && s.type === 'candidate-pair' && s.selected) pair = s;
      });
      const local = pair && stats.get(pair.localCandidateId);
      // how this browser reaches the relay: udp, tcp or tls
      out.push({ state: pc.connectionState, local: local?.candidateType, remote: pair && stats.get(pair.remoteCandidateId)?.candidateType, via: local?.relayProtocol ?? null });
    }
    return out;
  });

// the kind of each track every live connection sends, or null for a slot sending nothing
const sending = (page) => page.evaluate(() => window.__pcs.filter((pc) => pc.connectionState !== 'closed').flatMap((pc) => pc.getSenders().map((s) => s.track?.kind ?? null)));

const connected = (page, n) => until(`${n} connected peer connections`, async () => (await links(page)).filter((l) => l.state === 'connected').length >= n && (await links(page)));

export default { until, links, sending, connected };
