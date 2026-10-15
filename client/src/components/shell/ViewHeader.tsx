import './ViewHeader.css';
import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import ui from '../../actions/ui';

interface Props {
  title: ReactNode;
  icon?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export default function ViewHeader({ title, icon, subtitle, actions }: Props) {
  return (
    <header className="view-head">
      <button type="button" className="icon-btn menu-toggle" onClick={() => ui.sidebar(true)} aria-label="Open menu">
        <Menu />
      </button>
      <h1>
        {icon}
        <span>{title}</span>
      </h1>
      {subtitle && <span className="subtitle">{subtitle}</span>}
      <div className="view-head-actions">{actions}</div>
    </header>
  );
}
