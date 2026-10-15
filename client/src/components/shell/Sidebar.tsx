import './Sidebar.css';
import { useMemo } from 'react';
import { BadgeCheck, BarChart3, CalendarDays, Coins, Home, Inbox, Kanban, List, Plus, Search, Target, Vote } from 'lucide-react';
import Wordmark from '../ui/Wordmark';
import Avatar from '../ui/Avatar';
import UserMenu from './UserMenu';
import useStore from '../../state/useStore';
import useRoute from '../../hooks/useRoute';
import ui from '../../actions/ui';
import router from '../../lib/router';
import meta from '../../lib/meta';
import cx from '../../lib/cx';

const NAV = [
  { to: '/', label: 'My work', icon: Home, key: 'h' },
  { to: '/inbox', label: 'Inbox', icon: Inbox, key: 'i' },
  { to: '/board', label: 'Board', icon: Kanban, key: 'b' },
  { to: '/list', label: 'All tasks', icon: List, key: 'l' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, key: 'c' },
  { to: '/goals', label: 'Goals', icon: Target, key: 'g' },
  { to: '/insights', label: 'Insights', icon: BarChart3, key: 's' },
  { to: '/bounties', label: 'Bounties', icon: Coins, key: 'n' },
  { to: '/votes', label: 'Votes', icon: Vote, key: 'v' },
  { to: '/proofs', label: 'Proof of work', icon: BadgeCheck, key: 'p' },
];

export default function Sidebar({ onNewProject }: { onNewProject: () => void }) {
  const { path } = useRoute();
  const workspace = useStore((s) => s.workspace);
  const unread = useStore((s) => s.unread);
  const connected = useStore((s) => s.connected);
  const open = useStore((s) => s.sidebarOpen);
  const projectMap = useStore((s) => s.projects);
  const taskMap = useStore((s) => s.tasks);
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const meId = useStore((s) => s.me?.id);

  const projects = useMemo(() => Object.values(projectMap).filter((p) => !p.archived).sort((a, b) => a.position - b.position), [projectMap]);
  const openCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of Object.values(taskMap)) if (t.projectId && !meta.isClosed(t.status)) counts[t.projectId] = (counts[t.projectId] ?? 0) + 1;
    return counts;
  }, [taskMap]);
  const online = presence.filter((p) => p.userId !== meId).map((p) => users[p.userId]).filter(Boolean);

  const link = (to: string) => (e: React.MouseEvent) => {
    router.link(to)(e);
    ui.sidebar(false);
  };

  return (
    <>
      <div className={cx('sidebar-scrim', open && 'open')} onClick={() => ui.sidebar(false)} />
      <nav className={cx('sidebar', open && 'open')} aria-label="Main">
        <div className="sidebar-brand">
          <Wordmark size={17} />
          {workspace.name.toUpperCase() !== 'NONOS' && <span className="ws-name">{workspace.name}</span>}
          <span className={cx('conn-dot', !connected && 'off')} title={connected ? 'Live: changes sync instantly' : 'Reconnecting…'} />
        </div>

        <div className="sidebar-actions">
          <button type="button" className="search-btn" onClick={() => ui.palette()}>
            <Search size={14} /> Search <span className="kbd">⌘K</span>
          </button>
          <button type="button" className="btn btn-primary new-btn" onClick={() => ui.quickAdd()} title="New task (C)" aria-label="New task">
            <Plus />
          </button>
        </div>

        <div className="sidebar-scroll">
          <div className="nav">
            {NAV.map(({ to, label, icon: Icon }) => (
              <a key={to} href={to} onClick={link(to)} aria-current={path === to ? 'page' : undefined}>
                <Icon />
                {label}
                {to === '/inbox' && unread > 0 && <span className="badge num">{unread > 99 ? '99+' : unread}</span>}
              </a>
            ))}
          </div>

          <div className="sidebar-section">
            <span className="eyebrow">Projects</span>
            <button type="button" className="icon-only" onClick={onNewProject} aria-label="New project" title="New project">
              <Plus size={14} />
            </button>
          </div>
          <div className="nav">
            {projects.map((p) => (
              <a key={p.id} href={`/projects/${p.id}`} className="nav-project" onClick={link(`/projects/${p.id}`)} aria-current={path === `/projects/${p.id}` ? 'page' : undefined}>
                <i style={{ background: p.color }} />
                <span>{p.name}</span>
                {openCounts[p.id] ? <span className="count num">{openCounts[p.id]}</span> : null}
              </a>
            ))}
            {!projects.length && (
              <button type="button" className="nav-project" style={{ border: 0, background: 'none', color: 'var(--muted)' }} onClick={onNewProject}>
                <Plus size={14} /> <span>Create a project</span>
              </button>
            )}
          </div>

          {online.length > 0 && (
            <>
              <div className="sidebar-section">
                <span className="eyebrow">Online now</span>
              </div>
              <div className="online">
                {online.map((u) => (
                  <Avatar key={u.id} user={u} size={24} online title={`${u.name} is online`} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="sidebar-foot">
          <UserMenu />
        </div>
      </nav>
    </>
  );
}
