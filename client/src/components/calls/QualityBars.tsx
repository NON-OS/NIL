import { Signal, SignalLow, SignalMedium } from 'lucide-react';

const WORDS = { good: 'Good connection', fair: 'Fair connection', poor: 'Poor connection' };

// The connection's quality as signal bars, with the words for screen readers and on hover.
export default function QualityBars({ quality }: { quality: 'good' | 'fair' | 'poor' | null }) {
  if (!quality) return null;
  const Icon = quality === 'good' ? Signal : quality === 'fair' ? SignalMedium : SignalLow;
  return (
    <span className={`call-quality ${quality}`} title={WORDS[quality]}>
      <Icon aria-hidden="true" />
      <span className="sr-only">{WORDS[quality]}</span>
    </span>
  );
}
