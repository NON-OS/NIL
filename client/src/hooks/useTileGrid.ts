import { useLayoutEffect, useState } from 'react';

// How many columns, and how wide, `count` 16:9 tiles can be to fill a box as fully as possible:
// the arrangement video calls use, so faces stay as large as the window allows.
export default function useTileGrid(el: HTMLElement | null, count: number, gap = 8) {
  const [grid, setGrid] = useState({ cols: 1, width: 0 });

  useLayoutEffect(() => {
    if (!el) return;
    const fit = () => {
      const { width: W, height: H } = el.getBoundingClientRect();
      let best = { cols: 1, width: 0 };
      for (let cols = 1; cols <= Math.max(1, count); cols++) {
        const rows = Math.ceil(count / cols);
        const byWidth = (W - gap * (cols - 1)) / cols;
        const byHeight = ((H - gap * (rows - 1)) / rows) * (16 / 9);
        const width = Math.floor(Math.min(byWidth, byHeight));
        if (width > best.width) best = { cols, width };
      }
      setGrid((g) => (g.cols === best.cols && g.width === best.width ? g : best));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, count, gap]);

  return grid;
}
