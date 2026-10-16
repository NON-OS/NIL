import './Modal.css';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import useFocusTrap from '../../hooks/useFocusTrap';

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
  useFocusTrap(ref, { initialFocus: '[autofocus], input, textarea, button' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // with stacked dialogs only the top one reacts
      const scrims = document.querySelectorAll('.modal-scrim');
      if (e.key !== 'Escape' || scrims[scrims.length - 1] !== ref.current?.parentElement) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
