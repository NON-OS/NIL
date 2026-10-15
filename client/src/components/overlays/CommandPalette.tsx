import './CommandPalette.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, BarChart3, CalendarDays, Coins, FileText, Home, Inbox, Kanban, List, Plus, Search, Settings, Sparkles, Target, UserPlus, Vote } from 'lucide-react';
import Modal from '../ui/Modal';
import StatusIcon from '../ui/StatusIcon';
import useStore from '../../state/useStore';
import useTasks from '../../hooks/useTasks';
import ui from '../../actions/ui';
import detail from '../../actions/detail';
import router from '../../lib/router';
import fuzzyScore from '../../lib/fuzzyScore';
import meta from '../../lib/meta';

interface Item {
  id: string;
  group: string;
  title: string;
  icon: ReactNode;
  hint?: string;
  score: number;
  run: () => void;
}

const VIEWS = [
  { title: 'My work', to: '/', icon: <Home />, keys: 'g h' },
  { title: 'Inbox', to: '/inbox', icon: <Inbox />, keys: 'g i' },
  { title: 'Board', to: '/board', icon: <Kanban />, keys: 'g b' },
  { title: 'All tasks', to: '/list', icon: <List />, keys: 'g l' },
  { title: 'Calendar', to: '/calendar', icon: <CalendarDays />, keys: 'g c' },
  { title: 'Goals', to: '/goals', icon: <Target />, keys: 'g g' },
  { title: 'Insights', to: '/insights', icon: <BarChart3 />, keys: 'g s' },
  { title: 'Bounties', to: '/bounties', icon: <Coins />, keys: 'g n' },
  { title: 'Votes', to: '/votes', icon: <Vote />, keys: 'g v' },
  { title: 'Proof of work', to: '/proofs', icon: <BadgeCheck />, keys: 'g p' },
  { title: 'Settings', to: '/settings', icon: <Settings />, keys: 'g t' },
];

export default function CommandPalette() {
  const tasks = useTasks();
  const projects = useStore((s) => s.projects);
  const goals = useStore((s) => s.goals);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const aiOn = useStore((s) => s.ai);
  const isAdmin = useStore((s) => s.me?.role !== 'member');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const close = () => ui.palette(false);
  const then = (fn: () => void) => () => {
    close();
    fn();
  };

  const items = useMemo(() => {
    const q = query.trim();
    const out: Item[] = [];
    const add = (item: Omit<Item, 'score'>, text: string) => {
      const score = fuzzyScore(text, q);
      if (score > 0) out.push({ ...item, score });
    };

    add({ id: 'new', group: 'Actions', title: 'Create a task', icon: <Plus />, hint: 'C', run: then(() => ui.quickAdd()) }, 'create new task add');
    if (aiOn) add({ id: 'extract', group: 'Actions', title: 'Turn notes into tasks', icon: <Sparkles />, run: then(() => ui.extract()) }, 'notes meeting extract ai tasks');
    if (isAdmin) add({ id: 'invite', group: 'Actions', title: 'Invite a teammate', icon: <UserPlus />, run: then(() => router.navigate('/settings?tab=team')) }, 'invite teammate member people');
    for (const v of VIEWS) add({ id: v.to, group: 'Go to', title: v.title, icon: v.icon, hint: v.keys, run: then(() => router.navigate(v.to)) }, v.title);
    for (const p of Object.values(projects).filter((p) => !p.archived)) {
      add({ id: `p${p.id}`, group: 'Projects', title: p.name, icon: <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, margin: 3 }} />, hint: p.key, run: then(() => router.navigate(`/projects/${p.id}`)) }, `${p.name} ${p.key}`);
    }
    for (const g of Object.values(goals)) add({ id: `g${g.id}`, group: 'Goals', title: g.title, icon: <Target />, run: then(() => router.navigate('/goals')) }, g.title);

    if (q) {
      const matches = tasks
        .map((t) => ({ t, score: fuzzyScore(`${prefix}-${t.number} ${t.title}`, q) + (meta.isClosed(t.status) ? -20 : 0) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
      for (const { t, score } of matches) {
        out.push({ id: `t${t.id}`, group: 'Tasks', title: t.title, icon: <StatusIcon status={t.status} size={15} />, hint: `${prefix}-${t.number}`, score: score + 30, run: then(() => detail.open(t)) });
      }
    }

    const order = q ? ['Tasks', 'Projects', 'Goals', 'Go to', 'Actions'] : ['Actions', 'Go to', 'Projects', 'Goals'];
    return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.score - a.score).slice(0, 40);
  }, [query, tasks, projects, goals, prefix, aiOn, isAdmin]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <Modal onClose={close} width={620} label="Command palette">
      <div className="palette-input">
        <Search />
        <input
          autoFocus
          value={query}
          placeholder="Search tasks, projects, or jump anywhere…"
          aria-label="Search"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              items[active]?.run();
            }
          }}
        />
      </div>
      <ul className="palette-results" ref={listRef} role="listbox">
        {items.map((item, i) => (
          <li key={item.id}>
            {(i === 0 || items[i - 1].group !== item.group) && <div className="palette-group eyebrow">{item.group}</div>}
            <button type="button" className="palette-item" data-index={i} data-active={i === active} onMouseMove={() => setActive(i)} onClick={item.run} role="option" aria-selected={i === active}>
              {item.icon}
              <span className="title">{item.title}</span>
              {item.hint && <span className="key mono">{item.hint}</span>}
            </button>
          </li>
        ))}
        {!items.length && (
          <li className="palette-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <FileText size={14} /> Nothing matches “{query}”.
          </li>
        )}
      </ul>
      <div className="palette-foot">
        <span>
          <span className="kbd">↑</span> <span className="kbd">↓</span> to move
        </span>
        <span>
          <span className="kbd">↵</span> to open
        </span>
        <span>
          <span className="kbd">esc</span> to close
        </span>
      </div>
    </Modal>
  );
}
