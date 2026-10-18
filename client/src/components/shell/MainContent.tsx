import { useEffect, useRef, type ReactNode } from 'react';
import useRoute from '../../hooks/useRoute';
import landmarks from '../../lib/landmarks';

// The page's one main region. Opening another section moves focus here, so keyboard and screen
// reader users start at the top of the new page rather than wherever the old one left them.
// Moving within a section, from one doc or help page to the next, leaves focus alone.
export default function MainContent({ children }: { children: ReactNode }) {
  const section = useRoute().segments[0] ?? '';
  const shown = useRef(section);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (shown.current === section) return;
    shown.current = section;
    ref.current?.focus({ preventScroll: true });
  }, [section]);

  return (
    <main id={landmarks.content} ref={ref} tabIndex={-1}>
      {children}
    </main>
  );
}
