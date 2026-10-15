import { useEffect, type RefObject } from 'react';

export default function useOutsideClick(refs: RefObject<HTMLElement>[], onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: PointerEvent) => {
      if (refs.every((r) => r.current && !r.current.contains(e.target as Node))) onOutside();
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [active, onOutside, refs]);
}
