import './Sidebar.css';
import { useEffect, useMemo, useRef } from 'react';
import { CircleHelp, Plus, Search } from 'lucide-react';
import NilLogo from '../brand/NilLogo';
import Avatar from '../ui/Avatar';
import UserMenu from './UserMenu';
import RunningTimer from '../time/RunningTimer';
import useStore from '../../state/useStore';
import useRoute from '../../hooks/useRoute';
import ui from '../../actions/ui';
import router from '../../lib/router';
import meta from '../../lib/meta';
import cx from '../../lib/cx';
import NAV from '../../lib/navItems';
import cryptoOnly from '../../lib/cryptoOnly';
import useCryptoTools from '../../hooks/useCryptoTools';
import useFocusTrap from '../../hooks/useFocusTrap';
import useMediaQuery from '../../hooks/useMediaQuery';
import media from '../../lib/media';
import landmarks from '../../lib/landmarks';

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
  const guest = useStore((s) => s.guest);
  const cryptoTools = useCryptoTools();
  // on narrow screens the sidebar is a menu over the page: focus goes in and stays until it closes
  const folded = useMediaQuery(media.sidebarFolds);
  const menu = open && folded;
  const ref = useRef<HTMLElement>(null);

  // The page underneath can't be reached while the menu covers it. This comes before the focus
  // trap, so on closing the page is reachable again by the time focus goes back to the button.
  useEffect(() => {
    if (!menu) return;
    const content = document.getElementById(landmarks.content);
    content?.setAttribute('inert', '');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) ui.sidebar(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      content?.removeAttribute('inert');
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  useFocusTrap(ref, { active: menu, initialFocus: '[aria-current="page"]' });

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
      <nav ref={ref} id={landmarks.menu} className={cx('sidebar', open && 'open')} aria-label="Main" tabIndex={-1}>
        <div className="sidebar-brand">
          <NilLogo height={30} />
          {workspace.name && (
            <span className="ws-name" title={workspace.name}>
              <span aria-hidden="true">/</span> {workspace.name}
            </span>
          )}
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
            {NAV.filter((n) => !(guest && 'members' in n) && (cryptoTools || !cryptoOnly(n.to))).map(({ to, label, icon: Icon, key }) => (
              <a key={to} href={to} onClick={link(to)} aria-current={path === to || (to !== '/' && path.startsWith(`${to}/`)) ? 'page' : undefined}>
                <Icon />
                {label}
                {to === '/inbox' && unread > 0 ? <span className="badge num">{unread > 99 ? '99+' : unread}</span> : <span className="nav-key" aria-hidden="true">G {key.toUpperCase()}</span>}
              </a>
            ))}
          </div>

          <div className="sidebar-section">
            <span className="eyebrow">Projects</span>
            {!guest && (
              <button type="button" className="icon-only" onClick={onNewProject} aria-label="New project" title="New project">
                <Plus size={14} />
              </button>
            )}
          </div>
          <div className="nav">
            {projects.map((p) => (
              <a key={p.id} href={`/projects/${p.id}`} className="nav-project" onClick={link(`/projects/${p.id}`)} aria-current={path === `/projects/${p.id}` ? 'page' : undefined}>
                <i style={{ background: p.color }} />
                <span>{p.name}</span>
                {openCounts[p.id] ? <span className="count num">{openCounts[p.id]}</span> : null}
              </a>
            ))}
            {!projects.length && !guest && (
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

        <RunningTimer />
        <div className="sidebar-foot">
          <UserMenu />
          <a className="icon-btn" href="/help" onClick={link('/help')} aria-current={path.startsWith('/help') ? 'page' : undefined} title="Help" aria-label="Help">
            <CircleHelp />
          </a>
        </div>
      </nav>
    </>
  );
}
