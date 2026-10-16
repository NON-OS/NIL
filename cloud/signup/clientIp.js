// The visitor's address. Behind Caddy (CLOUD_TRUST_PROXY=1) it is the last X-Forwarded-For
// entry, the one Caddy added; earlier entries come from the visitor and can say anything.
export default function clientIp(req, trustedHops) {
  if (trustedHops > 0) {
    const chain = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (chain.length >= trustedHops) return chain[chain.length - trustedHops];
  }
  return req.socket.remoteAddress ?? 'unknown';
}
