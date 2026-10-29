// A connection's quality, from what the browser measured over the last few seconds: round
// trip time, the share of packets lost and jitter. The thresholds are where people start to
// notice, then start to talk over each other.
export interface LinkSample {
  rtt: number | null;
  lost: number;
  received: number;
  jitter: number | null;
}

export default function linkQuality({ rtt, lost, received, jitter }: LinkSample): 'good' | 'fair' | 'poor' | null {
  const total = lost + received;
  if (rtt === null && total === 0) return null;
  const loss = total > 0 ? lost / total : 0;
  if (loss > 0.08 || (rtt ?? 0) > 0.6 || (jitter ?? 0) > 0.1) return 'poor';
  if (loss > 0.02 || (rtt ?? 0) > 0.3 || (jitter ?? 0) > 0.05) return 'fair';
  return 'good';
}
