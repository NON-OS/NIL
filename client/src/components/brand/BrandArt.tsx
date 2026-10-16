import brandPaths from './brandPaths';

const BOX = { logo: '0 0 1428 500', mark: '0 0 450 500', icon: '0 0 188 204' } as const;

interface Props {
  kind: keyof typeof BOX;
  height: number;
  className?: string;
  // pass an empty label when the name is already written next to the mark
  label?: string;
}

// Official artwork, rendered inline so it stays crisp at any size. The Ø mark is always
// NØNOS Cyan; the letters follow the surrounding text colour (ink on light, white on dark).
export default function BrandArt({ kind, height, className, label = 'NØNOS' }: Props) {
  const [, , w, h] = BOX[kind].split(' ').map(Number);
  return (
    <svg viewBox={BOX[kind]} height={height} width={(height * w) / h} className={className} fill="none" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      {brandPaths[kind].map((p, i) => {
        const colour = p.part === 'mark' ? 'var(--brand-cyan)' : 'currentColor';
        return <path key={i} d={p.d} fillRule={p.evenodd ? 'evenodd' : undefined} clipRule={p.evenodd ? 'evenodd' : undefined} {...(p.paint === 'stroke' ? { stroke: colour } : { fill: colour })} />;
      })}
    </svg>
  );
}
