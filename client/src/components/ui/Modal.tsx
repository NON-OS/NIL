import './Modal.css';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  label?: string;
}

export default function Modal({ title, onClose, children, footer, width = 560, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    const returnTo = opener.current;
    const onKey = (e: KeyboardEvent) => {
      // with stacked dialogs only the top one reacts
      const scrims = document.querySelectorAll('.modal-scrim');
      if (scrims[scrims.length - 1] !== ref.current?.parentElement) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // keep Tab inside the dialog
      if (e.key === 'Tab' && ref.current) {
        const focusable = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    if (!ref.current?.contains(document.activeElement)) ref.current?.querySelector<HTMLElement>('[autofocus], input, textarea, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (returnTo instanceof HTMLElement) returnTo.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={label ?? title}>
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
