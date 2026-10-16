import { useEffect, useState, type RefObject } from 'react';

// True while a horizontal scroller has content hidden past its trailing edge.
export default function useOverflowEnd(ref: RefObject<HTMLElement>) {
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    check();
    el.addEventListener('scroll', check, { passive: true });
    // chips change width when a filter is picked, and a Clear button comes and goes
    const resized = new ResizeObserver(check);
    resized.observe(el);
    const changed = new MutationObserver(check);
    changed.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', check);
      resized.disconnect();
      changed.disconnect();
    };
  }, [ref]);

  return more;
}
