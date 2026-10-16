import { useRef, useState } from 'react';
import { CircleHelp, Code2, Keyboard, LogOut, Settings } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Popover from '../ui/Popover';
import useStore from '../../state/useStore';
import session from '../../actions/session';
import ui from '../../actions/ui';
import router from '../../lib/router';
import shortAddress from '../../lib/shortAddress';

export default function UserMenu() {
  const me = useStore((s) => s.me);
  const sourceUrl = useStore((s) => s.sourceUrl);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button ref={anchor} type="button" className="me-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Account menu">
        <Avatar user={me} size={26} />
        <span className="me-who">
          <b>{me?.name}</b>
          {me?.address && (
            <small title={me.address}>
              <i aria-hidden="true" /> {shortAddress(me.address)}
            </small>
          )}
        </span>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={230}>
        <div className="menu-list">
          <div style={{ padding: '6px 8px 8px' }}>
            <div style={{ fontWeight: 600 }}>{me?.name}</div>
            {me?.address && <div className="muted mono" style={{ fontSize: 'var(--text-xs)' }}>{shortAddress(me.address)}</div>}
          </div>
          <div className="menu-divider" />
          <button type="button" className="menu-item" onClick={go(() => router.navigate('/settings'))}>
            <Settings size={14} /> Settings
          </button>
          <button type="button" className="menu-item" onClick={go(() => ui.shortcuts())}>
            <Keyboard size={14} /> Keyboard shortcuts
          </button>
          <button type="button" className="menu-item" onClick={go(() => router.navigate('/help'))}>
            <CircleHelp size={14} /> Help
          </button>
          {sourceUrl && (
            <a className="menu-item" href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <Code2 size={14} /> Source code (AGPL)
            </a>
          )}
          <div className="menu-divider" />
          <button type="button" className="menu-item" onClick={go(session.logout)}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </Popover>
    </>
  );
}
