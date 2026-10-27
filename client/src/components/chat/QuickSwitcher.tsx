import '../overlays/CommandPalette.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import Modal from '../ui/Modal';
import ChannelIcon from './ChannelIcon';
import useChat from '../../state/useChat';
import chatTitle from '../../actions/chat/chatTitle';
import fuzzyScore from '../../lib/fuzzyScore';

// Ctrl+K (⌘K on a Mac) in chat: jump to any conversation by typing part of its name. Unread
// ones come first while nothing is typed.
export default function QuickSwitcher({ onOpen, onClose }: { onOpen: (id: string) => void; onClose: () => void }) {
  const channels = useChat((s) => s.channels);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => {
    const q = query.trim();
    return Object.values(channels)
      .map((c) => ({ c, title: chatTitle(c) }))
      .map((x) => ({ ...x, score: q ? fuzzyScore(x.title, q) : 1 + (x.c.unread ? 1e12 : 0) + x.c.lastAt / 1e3 }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [channels, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const open = (id: string | undefined) => {
    if (!id) return;
    onClose();
    onOpen(id);
  };

  return (
    <Modal onClose={onClose} width={520} label="Jump to a conversation">
      <div className="palette-input">
        <Search />
        <input
          autoFocus
          value={query}
          placeholder="Jump to a conversation…"
          aria-label="Jump to a conversation"
          role="combobox"
          aria-expanded="true"
          aria-controls="chat-switcher-list"
          aria-activedescendant={items[active] ? `chat-switch-${items[active].c.id}` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              open(items[active]?.c.id);
            }
          }}
        />
      </div>
      <ul id="chat-switcher-list" className="palette-results" ref={listRef} role="listbox" aria-label="Conversations" hidden={!items.length}>
        {items.map(({ c, title }, i) => (
          <li key={c.id} id={`chat-switch-${c.id}`} className="palette-item" data-index={i} data-active={i === active} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => open(c.id)}>
            <ChannelIcon channel={c} size={16} />
            <span className="palette-text">
              <span className="title">{title}</span>
            </span>
            {c.unread > 0 && <span className="key mono">{c.unread} new</span>}
          </li>
        ))}
      </ul>
      {!items.length && <p className="palette-group">Nothing matches “{query}”.</p>}
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
