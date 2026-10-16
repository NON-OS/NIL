import './CommandPalette.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, BarChart3, CalendarDays, CircleHelp, Coins, FileText, Home, Inbox, Kanban, List, Lock, Plus, Presentation, Search, Settings, Sparkles, Target, Timer, UserPlus, Vote } from 'lucide-react';
import Modal from '../ui/Modal';
import StatusIcon from '../ui/StatusIcon';
import Highlight from '../ui/Highlight';
import useStore from '../../state/useStore';
import useTasks from '../../hooks/useTasks';
import useTeamSearch from '../../hooks/useTeamSearch';
import ui from '../../actions/ui';
import detail from '../../actions/detail';
import router from '../../lib/router';
import fuzzyScore from '../../lib/fuzzyScore';
import searchOpened from '../../lib/searchOpened';
import meta from '../../lib/meta';
import decks from '../../actions/decks';
import useArchiveSearch from '../../hooks/useArchiveSearch';
import isAdminUser from '../../lib/isAdmin';
import cryptoOnly from '../../lib/cryptoOnly';
import useCryptoTools from '../../hooks/useCryptoTools';
import type SearchHit from '../../types/SearchHit';

interface Item {
  id: string;
  group: string;
  title: string;
  icon: ReactNode;
  hint?: string;
  // private tasks get a lock next to their key
  locked?: boolean;
  // where the words were found, when it wasn't the title
  match?: { label: string; text: string };
  // the hint is a keyboard shortcut rather than a key like NON-12
  shortcut?: boolean;
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
  { title: 'Docs', to: '/docs', icon: <FileText />, keys: 'g d' },
  { title: 'Time', to: '/time', icon: <Timer />, keys: 'g m' },
  { title: 'Bounties', to: '/bounties', icon: <Coins />, keys: 'g n' },
  { title: 'Votes', to: '/votes', icon: <Vote />, keys: 'g v' },
  { title: 'Proof of work', to: '/proofs', icon: <BadgeCheck />, keys: 'g p' },
  { title: 'Settings', to: '/settings', icon: <Settings />, keys: 'g t' },
];

const FIELD: Record<SearchHit['field'], string> = { title: 'Title', description: 'Notes', checklist: 'Checklist', comment: 'Comment', body: 'Doc' };

export default function CommandPalette() {
  const tasks = useTasks();
  const projects = useStore((s) => s.projects);
  const goals = useStore((s) => s.goals);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const aiOn = useStore((s) => s.ai);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const cryptoTools = useCryptoTools();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const teamHits = useTeamSearch(query);
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

    add({ id: 'new', group: 'Actions', title: 'Create a task', icon: <Plus />, hint: 'C', shortcut: true, run: then(() => ui.quickAdd()) }, 'create new task add');
    if (aiOn) add({ id: 'extract', group: 'Actions', title: 'Turn notes into tasks', icon: <Sparkles />, run: then(() => ui.extract()) }, 'notes meeting extract ai tasks');
    add({ id: 'deck', group: 'Actions', title: 'Create a status deck (.pptx)', icon: <Presentation />, run: then(() => decks.open()) }, 'deck powerpoint pptx slides presentation status report');
    if (isAdmin) add({ id: 'invite', group: 'Actions', title: 'Invite a teammate', icon: <UserPlus />, run: then(() => router.navigate('/settings?tab=team')) }, 'invite teammate member people');
    for (const v of VIEWS.filter((view) => cryptoTools || !cryptoOnly(view.to))) add({ id: v.to, group: 'Go to', title: v.title, icon: v.icon, hint: v.keys, shortcut: true, run: then(() => router.navigate(v.to)) }, v.title);
    add({ id: 'help', group: 'Go to', title: 'Help', icon: <CircleHelp />, run: then(() => router.navigate('/help')) }, 'help guide how to docs faq questions');
    // whatever was typed can also be looked up in the help pages
    if (q) out.push({ id: 'help-search', group: 'Go to', title: `Search help for “${q}”`, icon: <CircleHelp />, score: 1, run: then(() => router.navigate(`/help?q=${encodeURIComponent(q)}`)) });
    for (const p of Object.values(projects).filter((p) => !p.archived)) {
      add({ id: `p${p.id}`, group: 'Projects', title: p.name, icon: <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, margin: 3 }} />, hint: p.key, run: then(() => router.navigate(`/projects/${p.id}`)) }, `${p.name} ${p.key}`);
    }
    for (const g of Object.values(goals)) add({ id: `g${g.id}`, group: 'Goals', title: g.title, icon: <Target />, run: then(() => router.navigate('/goals')) }, g.title);

    if (q) {
      // titles and keys this tab knows, then what the words turned up: team tasks from the
      // server, private tasks and docs from this browser
      const found = new Map<string, Item>();
      const matches = tasks
        .map((t) => ({ t, score: fuzzyScore(`${prefix}-${t.number} ${t.title}`, q) + (meta.isClosed(t.status) ? -20 : 0) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
      for (const { t, score } of matches) {
        found.set(t.id, { id: `t${t.id}`, group: 'Tasks', title: t.title, icon: <StatusIcon status={t.status} size={15} />, hint: `${prefix}-${t.number}`, locked: Boolean(t.sealed), score: score + 30, run: then(() => detail.open(t)) });
      }
      const local = searchOpened(q, tasks);
      const privateTasks = local.filter((h) => h.kind === 'task');
      for (const [i, hit] of [...privateTasks, ...teamHits].entries()) {
        const match = hit.field === 'title' ? undefined : { label: FIELD[hit.field], text: hit.snippet };
        const known = found.get(hit.id);
        if (known) {
          known.match ??= match;
          continue;
        }
        found.set(hit.id, {
          id: `t${hit.id}`,
          group: 'Tasks',
          title: hit.title,
          icon: <StatusIcon status={hit.status ?? 'todo'} size={15} />,
          hint: `${prefix}-${hit.number}`,
          locked: i < privateTasks.length,
          match,
          score: 20 - i,
          run: then(() => detail.open({ number: hit.number! })),
        });
      }
      out.push(...found.values());
      for (const [i, hit] of local.filter((h) => h.kind === 'doc').entries()) {
        out.push({ id: `d${hit.id}`, group: 'Docs', title: hit.title, icon: <FileText />, locked: true, match: hit.field === 'title' ? undefined : { label: FIELD[hit.field], text: hit.snippet }, score: 20 - i, run: then(() => router.navigate(`/docs/${hit.id}`)) });
      }
    }

    const order = q ? ['Tasks', 'Docs', 'Projects', 'Goals', 'Go to', 'Actions'] : ['Actions', 'Go to', 'Projects', 'Goals'];
    return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.score - a.score).slice(0, 40);
  }, [query, tasks, projects, goals, prefix, aiOn, isAdmin, cryptoTools, teamHits]);

  useArchiveSearch(query);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const q = query.trim();

  return (
    <Modal onClose={close} width={620} label="Command palette">
      <div className="palette-input">
        <Search />
        <input
          autoFocus
          value={query}
          placeholder="Search tasks, docs and comments, or jump anywhere…"
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
      <ul className="palette-results" ref={listRef} role="listbox" aria-label="Results">
        {items.map((item, i) => (
          <li key={item.id}>
            {(i === 0 || items[i - 1].group !== item.group) && <div className="palette-group eyebrow">{item.group}</div>}
            <button type="button" className="palette-item" data-index={i} data-active={i === active} onMouseMove={() => setActive(i)} onClick={item.run} role="option" aria-selected={i === active}>
              {item.icon}
              <span className="palette-text">
                <span className="title">{q ? <Highlight text={item.title} query={q} /> : item.title}</span>
                {item.match && (
                  <span className="palette-snippet">
                    {item.match.label}: <Highlight text={item.match.text} query={q} />
                  </span>
                )}
              </span>
              {item.locked && <Lock className="palette-lock" aria-label="Private" />}
              {item.hint && <span className={item.shortcut ? 'key mono shortcut' : 'key mono'}>{item.hint}</span>}
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
        {q && <span className="palette-note">Private tasks and docs are searched only in this browser</span>}
      </div>
    </Modal>
  );
}
