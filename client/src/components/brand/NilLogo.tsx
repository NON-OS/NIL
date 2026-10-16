import brandPaths from './brandPaths';
import nilPaths from './nilPaths';

interface Props {
  height: number;
  className?: string;
  label?: string;
}

// Nil's lockup: the official Ø mark, which already reads as "nothing", followed by the Nil
// letters. Like the NØNOS logo, the mark is always cyan and the letters take the text colour.
export default function NilLogo({ height, className, label = 'Nil' }: Props) {
  const [, , w, h] = nilPaths.viewBox.split(' ').map(Number);
  return (
    <svg viewBox={nilPaths.viewBox} height={height} width={(height * w) / h} className={className} fill="none" role="img" aria-label={label}>
      {brandPaths.mark.map((p, i) => (
        <path key={i} d={p.d} fill="var(--brand-cyan)" />
      ))}
      <path d={nilPaths.d} fill="currentColor" />
    </svg>
  );
}
