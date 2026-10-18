import './Toasts.css';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import usePageVisible from '../../hooks/usePageVisible';
import landmarks from '../../lib/landmarks';
import cx from '../../lib/cx';
import type ToastMessage from '../../types/ToastMessage';

// Dismissing a toast that has focus would leave focus nowhere, so it goes back to where it came
// from, or to the page when that's gone.
function dismiss(item: ToastMessage, el: HTMLElement | null, cameFrom: Element | null) {
  const hadFocus = el?.contains(document.activeElement);
  toast.dismiss(item.id);
  if (!hadFocus) return;
  const back = cameFrom instanceof HTMLElement && cameFrom.isConnected ? cameFrom : document.getElementById(landmarks.content);
  back?.focus({ preventScroll: true });
}

function ToastItem({ item }: { item: ToastMessage }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const visible = usePageVisible();
  // the time it has left, kept across pauses, and what had focus before the toast took it
  const left = useRef(item.timeout);
  const cameFrom = useRef<Element | null>(null);

  useEffect(() => {
    if (hovered || focused || !visible) return;
    const started = Date.now();
    const id = setTimeout(() => toast.dismiss(item.id), left.current);
    return () => {
      clearTimeout(id);
      left.current -= Date.now() - started;
    };
  }, [item.id, hovered, focused, visible]);

  return (
    <div
      ref={ref}
      className={cx('toast', item.tone === 'error' && 'toast-error')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) cameFrom.current = e.relatedTarget;
        setFocused(true);
      }}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        dismiss(item, ref.current, cameFrom.current);
      }}
    >
      {item.tone === 'success' && <CheckCircle2 aria-hidden="true" />}
      {item.tone === 'error' && <AlertCircle aria-hidden="true" />}
      <span className="toast-message">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            item.action!.run();
            dismiss(item, ref.current, cameFrom.current);
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" className="toast-close hit" onClick={() => dismiss(item, ref.current, cameFrom.current)} aria-label="Dismiss">
        <X />
      </button>
    </div>
  );
}

// Toasts are read out as they arrive, without taking focus from what you're doing. They stay
// up long enough to read, pause while hovered or focused, and close with their button or Escape.
export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions text">
      {toasts.map((t) => (
        <ToastItem key={t.id} item={t} />
      ))}
    </div>
  );
}
