import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';

interface Options {
  count: number;
  keyAt: (index: number) => string;
  // a first guess at a row's height, until it's measured
  estimate: number;
  // asked for when the list is scrolled near its top
  onTop?: () => void;
}

const OVERSCAN = 900;
const NEAR = 150;

// A long list that keeps only the rows near the screen in the page, for a chat that grows at the
// bottom and loads older pages at the top. Rows measure themselves; the list stays at the
// bottom while it's there, and keeps the row you're reading where it is when older ones arrive
// above it or a row above changes height.
export default function useVirtualList({ count, keyAt, estimate, onTop }: Options) {
  const ref = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, number>());
  const bottom = useRef(true);
  const first = useRef<string | null>(null);
  const [version, redraw] = useReducer((n: number) => n + 1, 0);
  const [, scrolled] = useReducer((n: number) => n + 1, 0);
  const onTopRef = useRef(onTop);
  onTopRef.current = onTop;

  const tops = useMemo(() => {
    const out = new Array<number>(count + 1);
    out[0] = 0;
    for (let i = 0; i < count; i++) out[i + 1] = out[i] + (heights.current.get(keyAt(i)) ?? estimate);
    return out;
    // `version` stands for the measured heights, which live in a ref
  }, [count, keyAt, estimate, version]);

  const el = ref.current;
  const top = el?.scrollTop ?? Number.MAX_SAFE_INTEGER;
  const view = el?.clientHeight ?? 800;
  const find = (y: number) => {
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tops[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const start = el ? Math.max(0, find(top - OVERSCAN)) : Math.max(0, count - 30);
  const end = el ? Math.min(count, find(top + view + OVERSCAN) + 1) : count;

  const onScroll = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    bottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < NEAR;
    if (node.scrollTop < NEAR) onTopRef.current?.();
    scrolled();
  }, []);

  // Rows report their height. One above what's on screen that grows pushes the reader's row
  // down, so the scroll moves with it.
  const observer = useMemo(
    () =>
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            const node = ref.current;
            let shift = 0;
            let changed = false;
            for (const entry of entries) {
              const row = entry.target as HTMLElement;
              const key = row.dataset.key!;
              const h = row.offsetHeight;
              const before = heights.current.get(key) ?? estimate;
              if (h === before && heights.current.has(key)) continue;
              heights.current.set(key, h);
              changed = true;
              if (node && row.offsetTop + before <= node.scrollTop) shift += h - before;
            }
            if (!changed) return;
            if (node && shift && !bottom.current) node.scrollTop += shift;
            redraw();
          }),
    [estimate],
  );
  useEffect(() => () => observer?.disconnect(), [observer]);

  const measure = useCallback(
    (node: HTMLElement | null) => {
      if (node && observer) observer.observe(node);
    },
    [observer],
  );

  // After every change: older rows arrived above, so keep the row that was first where it was;
  // or the list was at the bottom, so stay there.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const nowFirst = count ? keyAt(0) : null;
    if (first.current && nowFirst !== first.current && !bottom.current) {
      let i = 0;
      while (i < count && keyAt(i) !== first.current) i++;
      if (i < count) node.scrollTop += tops[i];
    }
    first.current = nowFirst;
    if (bottom.current) node.scrollTop = node.scrollHeight;
  });

  return {
    ref,
    onScroll,
    measure,
    start,
    end,
    before: tops[start],
    after: tops[count] - tops[end],
    atBottom: () => bottom.current,
    toBottom() {
      bottom.current = true;
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
      scrolled();
    },
    // brings a row into the list and onto the screen, for the keyboard and for jumps
    toIndex(index: number) {
      const node = ref.current;
      if (!node || index < 0 || index >= count) return;
      if (tops[index] < node.scrollTop) node.scrollTop = tops[index];
      else if (tops[index + 1] > node.scrollTop + node.clientHeight) node.scrollTop = tops[index + 1] - node.clientHeight;
      bottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < NEAR;
      scrolled();
    },
  };
}
