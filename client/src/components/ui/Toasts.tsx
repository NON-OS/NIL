import './Toasts.css';
import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import cx from '../../lib/cx';
import type ToastMessage from '../../types/ToastMessage';

function ToastItem({ item }: { item: ToastMessage }) {
  useEffect(() => {
    const id = setTimeout(() => toast.dismiss(item.id), item.timeout);
    return () => clearTimeout(id);
  }, [item]);

  return (
    <div className={cx('toast', item.tone === 'error' && 'toast-error')} role={item.tone === 'error' ? 'alert' : 'status'}>
      {item.tone === 'success' && <CheckCircle2 />}
      {item.tone === 'error' && <AlertCircle />}
      <span className="toast-message">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            item.action!.run();
            toast.dismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" className="toast-close" onClick={() => toast.dismiss(item.id)} aria-label="Dismiss">
        <X />
      </button>
    </div>
  );
}

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} item={t} />
      ))}
    </div>
  );
}
