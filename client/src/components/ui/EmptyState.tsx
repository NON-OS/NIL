import './EmptyState.css';
import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export default function EmptyState({ icon, title, children, actions }: Props) {
  return (
    <div className="empty">
      <div className="empty-art">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}
