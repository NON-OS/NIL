import { useCallback, useEffect, useState, type RefObject } from 'react';

const leadingPad = (el: HTMLElement) => parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;

// For a horizontal scroller whose children are pages, such as board columns on a phone:
// which child sits at the leading edge, and a way to bring any child there.
export default function useScrollIndex(ref: RefObject<HTMLElement>) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const items = [...el.children] as HTMLElement[];
      if (!items.length) return;
      // the last child can never reach the leading edge, so the far end counts as it
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) return setIndex(items.length - 1);
      const edge = el.getBoundingClientRect().left + leadingPad(el);
      let nearest = 0;
      items.forEach((item, i) => {
        if (Math.abs(item.getBoundingClientRect().left - edge) < Math.abs(items[nearest].getBoundingClientRect().left - edge)) nearest = i;
      });
      setIndex(nearest);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ref]);

  const scrollTo = useCallback(
    (i: number) => {
      const el = ref.current;
      const item = el?.children[i] as HTMLElement | undefined;
      if (!el || !item) return;
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left: item.offsetLeft - (el.firstElementChild as HTMLElement).offsetLeft, behavior: still ? 'auto' : 'smooth' });
      setIndex(i);
    },
    [ref],
  );

  return [index, scrollTo] as const;
}
