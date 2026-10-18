import './ViewHeader.css';
import type { ReactNode } from 'react';
import { Menu, Search } from 'lucide-react';
import Resolve from '../brand/Resolve';
import useRoute from '../../hooks/useRoute';
import ui from '../../actions/ui';
import navItems from '../../lib/navItems';
import landmarks from '../../lib/landmarks';
import useStore from '../../state/useStore';

interface Props {
  title: ReactNode;
  icon?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export default function ViewHeader({ title, icon, subtitle, actions }: Props) {
  const { path } = useRoute();
  const menuOpen = useStore((s) => s.sidebarOpen);
  // main sections carry their number, like the brand's numbered pages: 01 My work, 02 Inbox…
  const index = navItems.findIndex((n) => n.to === path || (n.to !== '/' && path.startsWith(`${n.to}/`)));

  return (
    <header className="view-head">
      <button type="button" className="icon-btn menu-toggle" onClick={() => ui.sidebar(true)} aria-label="Open menu" aria-controls={landmarks.menu} aria-expanded={menuOpen}>
        <Menu />
      </button>
      {index >= 0 && <span className="view-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}
      <h1>
        {icon}
        {typeof title === 'string' ? <Resolve text={title} /> : <span>{title}</span>}
      </h1>
      {subtitle && <span className="subtitle">{subtitle}</span>}
      <div className="view-head-actions">
        {actions}
        {/* the sidebar holds search on wide screens; folded away, it gets its own button */}
        <button type="button" className="icon-btn search-toggle" onClick={() => ui.palette()} aria-label="Search">
          <Search />
        </button>
      </div>
      <i className="view-rule" key={path} aria-hidden="true" />
    </header>
  );
}
