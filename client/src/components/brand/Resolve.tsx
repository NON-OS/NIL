import { useEffect, useState } from 'react';

const GLYPHS = '0123456789ABCDEF#/Ø';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Text that resolves character by character, the brand's one title animation. Screen readers
// get the final text straight away; people who prefer less motion just see it.
export default function Resolve({ text, className }: { text: string; className?: string }) {
  const [settled, setSettled] = useState(reduced() ? text.length : 0);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (reduced()) return setSettled(text.length);
    setSettled(0);
    const start = performance.now();
    const duration = Math.min(700, 28 * text.length);
    let frame = 0;
    const step = (now: number) => {
      const done = Math.min(text.length, Math.floor(((now - start) / duration) * text.length));
      setSettled(done);
      setTick((t) => t + 1);
      if (done < text.length) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, settled)}
        {settled < text.length && (
          <span className="resolving">
            {[...text.slice(settled)].map((ch) => (ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('')}
          </span>
        )}
      </span>
    </span>
  );
}
