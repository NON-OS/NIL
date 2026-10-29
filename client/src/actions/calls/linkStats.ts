import linkQuality, { type LinkSample } from '../../lib/calls/linkQuality';

export interface StatsTotals {
  lost: number;
  received: number;
}

// One look at a connection's statistics: how it's doing since the last look, and the
// fingerprint of the certificate the other browser actually used, where the browser reports it.
export default async function linkStats(pc: RTCPeerConnection, last: StatsTotals) {
  const report = await pc.getStats();
  let rtt: number | null = null;
  let jitter: number | null = null;
  const totals: StatsTotals = { lost: 0, received: 0 };
  let certificateId: string | null = null;
  const byId = new Map<string, any>();
  report.forEach((s: any) => {
    byId.set(s.id, s);
    if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && typeof s.currentRoundTripTime === 'number') rtt = s.currentRoundTripTime;
    if (s.type === 'inbound-rtp' && !s.isRemote) {
      totals.lost += Math.max(0, s.packetsLost ?? 0);
      totals.received += s.packetsReceived ?? 0;
      if (s.kind === 'audio' && typeof s.jitter === 'number') jitter = s.jitter;
    }
    if (s.type === 'transport' && s.remoteCertificateId) certificateId = s.remoteCertificateId;
  });
  const sample: LinkSample = { rtt, jitter, lost: Math.max(0, totals.lost - last.lost), received: Math.max(0, totals.received - last.received) };
  const cert = certificateId ? byId.get(certificateId) : null;
  const certificate = cert?.fingerprint && cert?.fingerprintAlgorithm ? `${String(cert.fingerprintAlgorithm).toLowerCase()} ${String(cert.fingerprint).toUpperCase()}` : null;
  return { quality: linkQuality(sample), certificate, totals };
}
