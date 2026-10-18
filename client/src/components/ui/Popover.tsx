import './Popover.css';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import useOutsideClick from '../../hooks/useOutsideClick';

interface Props {
  anchor: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: 'start' | 'end';
}

const GAP = 6;
const EDGE = 8;

export default function Popover({ anchor, open, onClose, children, width, align = 'start' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = ref.current;
    if (!a || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = align === 'end' ? a.right - w : a.left;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
    // open upward when there isn't room below
    let top = a.bottom + GAP;
    if (top + h > window.innerHeight - EDGE && a.top - GAP - h > EDGE) top = a.top - GAP - h;
    setPos({ top: Math.max(EDGE, top), left });
  }, [anchor, align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, anchor]);

  useOutsideClick([ref, anchor as RefObject<HTMLElement>], onClose, open);

  if (!open) return null;
  // named after the button that opened it, so a screen reader says what this is
  const opener = anchor.current;
  const name = opener?.getAttribute('aria-label') || opener?.title || opener?.textContent?.trim() || undefined;
  return createPortal(
    <div ref={ref} className="popover" style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }} role="dialog" aria-label={name}>
      {children}
    </div>,
    document.body,
  );
}
