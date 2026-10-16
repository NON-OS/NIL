import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  // the accessible name while unarmed, for buttons that show only an icon
  label?: string;
}

// Destructive actions take two clicks: the first arms the button for a few seconds.
export default function ConfirmButton({ onConfirm, children, confirmLabel = 'Click again to confirm', className = 'btn btn-danger', label }: Props) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <button
      type="button"
      className={className}
      aria-label={armed ? undefined : label}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
