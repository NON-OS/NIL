import { useRef, useState } from 'react';
import { Keyboard, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Popover from '../ui/Popover';
import useStore from '../../state/useStore';
import useTheme from '../../hooks/useTheme';
import session from '../../actions/session';
import ui from '../../actions/ui';
import router from '../../lib/router';

export default function UserMenu() {
  const me = useStore((s) => s.me);
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button ref={anchor} type="button" className="me-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Account menu">
        <Avatar user={me} size={24} />
        <span>{me?.name}</span>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={230}>
        <div className="menu-list">
          <div style={{ padding: '6px 8px 8px' }}>
            <div style={{ fontWeight: 600 }}>{me?.name}</div>
            <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{me?.email}</div>
          </div>
          <div className="menu-divider" />
          <button type="button" className="menu-item" onClick={go(() => router.navigate('/settings'))}>
            <Settings size={14} /> Settings
          </button>
          <button type="button" className="menu-item" onClick={go(() => ui.shortcuts())}>
            <Keyboard size={14} /> Keyboard shortcuts
          </button>
          <div className="menu-divider" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 4 }} role="radiogroup" aria-label="Theme">
            {([['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'Auto']] as const).map(([value, Icon, label]) => (
              <button key={value} type="button" role="radio" aria-checked={theme === value} className={`btn btn-sm${theme === value ? '' : ' btn-ghost'}`} onClick={() => setTheme(value)}>
                <Icon /> {label}
              </button>
            ))}
          </div>
          <div className="menu-divider" />
          <button type="button" className="menu-item" onClick={go(session.logout)}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </Popover>
    </>
  );
}
