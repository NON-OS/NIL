// NONOS, with the two O's drawn as task rings: one open, one done.
// `inverted` is for use on the accent color, where the filled ring flips to the light ink.
export default function Wordmark({ size = 18, inverted = false }: { size?: number; inverted?: boolean }) {
  const ring = (done: boolean) => (
    <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 14 14" aria-hidden="true" style={{ margin: `0 ${size * 0.03}px`, transform: `translateY(${size * 0.04}px)` }}>
      {done ? (
        <>
          <circle cx="7" cy="7" r="6.2" fill={inverted ? 'var(--accent-ink)' : 'var(--accent)'} />
          <path d="M4.2 7.2l1.9 1.9 3.7-3.9" fill="none" stroke={inverted ? 'var(--accent)' : 'var(--accent-ink)'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <circle cx="7" cy="7" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.9" />
      )}
    </svg>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 750, fontSize: size, letterSpacing: '-0.02em', lineHeight: 1 }} aria-label="NONOS">
      N{ring(false)}N{ring(true)}S
    </span>
  );
}
