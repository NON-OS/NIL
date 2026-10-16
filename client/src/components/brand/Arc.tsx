// The brand's single drawn arc, sweeping in from the edge. Pure line, no fill or glow.
export default function Arc({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 600" fill="none" aria-hidden="true">
      <path d="M600 220C390 220 220 390 220 600" stroke="var(--accent-line)" strokeWidth="1.5" pathLength={1} />
    </svg>
  );
}
