import { useMemo, useRef, useState } from 'react';
import { Clock, LayoutTemplate, Lock, Plus, ShieldAlert, Users } from 'lucide-react';
import Popover from '../ui/Popover';
import docTemplates, { type DocTemplate } from '../../lib/docState/docTemplates';
import useStore from '../../state/useStore';
import dates from '../../lib/dates';
import type DocItem from '../../types/DocItem';

interface Props {
  docs: DocItem[];
  waiting: { id: string; createdBy: string | null; updatedAt: number }[];
  current: string | undefined;
  onOpen: (id: string) => void;
  onNew: (template?: DocTemplate) => void;
  // a new doc made from a Word or Markdown file
  onImport: (file: File) => void;
}

// Search runs over titles decrypted in this tab; the server never sees what you look for.
export default function DocList({ docs, waiting, current, onOpen, onNew, onImport }: Props) {
  const users = useStore((s) => s.users);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const templatesAnchor = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? docs.filter((d) => d.title.toLowerCase().includes(q) || d.text?.toLowerCase().includes(q)) : docs;
  }, [docs, query]);

  return (
    <aside className="doc-list" aria-label="Docs">
      <div className="doc-list-head">
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search docs" aria-label="Search docs" />
        <button ref={templatesAnchor} type="button" className="btn" onClick={() => setPicking((p) => !p)} aria-label="New doc from a template" aria-expanded={picking} title="New doc from a template">
          <LayoutTemplate />
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onNew()} aria-label="New doc" title="New doc">
          <Plus />
        </button>
        <Popover anchor={templatesAnchor} open={picking} onClose={() => setPicking(false)} width={220} align="end">
          <div className="menu-list" role="menu" aria-label="Templates">
            {docTemplates.map((t) => (
              <button key={t.id} type="button" role="menuitem" className="menu-item" onClick={() => (setPicking(false), onNew(t))}>
                {t.label}
              </button>
            ))}
            <div className="menu-divider" />
            <button type="button" role="menuitem" className="menu-item" onClick={() => (setPicking(false), fileInput.current?.click())}>
              From a Word or Markdown file
            </button>
          </div>
        </Popover>
        <input
          ref={fileInput}
          type="file"
          hidden
          aria-hidden
          tabIndex={-1}
          accept=".docx,.md,.markdown,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onImport(file);
          }}
        />
      </div>
      <div className="doc-list-items">
        {shown.map((d) => (
          <button key={d.id} type="button" className="doc-link" aria-current={d.id === current} onClick={() => onOpen(d.id)}>
            <strong>{d.title || 'Untitled'}</strong>
            <small>
              {d.warning && <ShieldAlert aria-label={d.warning === 'unverified' ? 'Not verified' : 'Older than a version seen before'} style={{ color: 'var(--danger)' }} />}
              {d.audience === 'team' ? <Users /> : <Lock />}
              {d.audience === 'team' ? 'Team' : `${d.readers.length} ${d.readers.length === 1 ? 'person' : 'people'}`} · {dates.ago(d.updatedAt)}
            </small>
          </button>
        ))}
        {waiting.map((w) => (
          <div key={w.id} className="doc-link waiting" title="A teammate’s browser hands you the key once they’ve confirmed your key">
            <strong>Encrypted doc</strong>
            <small>
              <Clock /> Waiting for a key from {w.createdBy ? users[w.createdBy]?.name ?? 'a teammate' : 'a teammate'}
            </small>
          </div>
        ))}
        {!docs.length && !waiting.length && <p className="muted" style={{ padding: 12, fontSize: 'var(--text-sm)' }}>No docs yet. Specs, meeting notes, runbooks: write them here and only your team can read them.</p>}
      </div>
    </aside>
  );
}
