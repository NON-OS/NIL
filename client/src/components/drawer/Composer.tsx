import { useMemo, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import Avatar from '../ui/Avatar';
import AgentBadge from '../agents/AgentBadge';
import useStore from '../../state/useStore';
import detail from '../../actions/detail';
import socket from '../../realtime/socket';

// "@Jane Doe" is inserted as "@JaneDoe" so the server can match it exactly.
const handle = (name: string) => name.replace(/\s+/g, '');

export default function Composer({ taskId }: { taskId: string }) {
  const me = useStore((s) => s.me);
  const users = useStore((s) => s.users);
  const sealed = useStore((s) => Boolean(s.tasks[taskId]?.sealed));
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    // agents can't read a private task, so they aren't offered there
    return Object.values(users)
      .filter((u) => !u.deactivated && u.id !== me?.id && !(sealed && u.kind === 'agent') && (u.name.toLowerCase().includes(q) || handle(u.name).toLowerCase().startsWith(q)))
      .slice(0, 6);
  }, [mention, users, me?.id, sealed]);

  const onChange = (value: string, caret: number) => {
    setBody(value);
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\w.-]*)$/.exec(before);
    setMention(m ? { query: m[2], start: caret - m[2].length - 1 } : null);
    setActive(0);
    if (Date.now() - lastTyping.current > 2000) {
      lastTyping.current = Date.now();
      socket.typing(taskId);
    }
  };

  const insert = (name: string) => {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    const next = `${body.slice(0, mention.start)}@${handle(name)} ${body.slice(end)}`;
    setBody(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + handle(name).length + 2;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    if (await detail.comment(taskId, text)) setBody('');
    setSending(false);
  };

  return (
    <div className="composer">
      <Avatar user={me} size={26} />
      <div className="composer-box">
        <textarea
          ref={ref}
          value={body}
          rows={2}
          placeholder={sealed ? 'Write a comment. It’s encrypted, like the task.' : 'Write a comment… use @ to mention someone'}
          aria-label="Comment"
          onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (mention && matches.length) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insert(matches[active].name);
                return;
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setMention(null);
                return;
              }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        {mention && matches.length > 0 && (
          <ul className="mention-menu" role="listbox">
            {matches.map((u, i) => (
              <li key={u.id}>
                <button type="button" data-active={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(u.name)}>
                  <Avatar user={u} size={18} />
                  {u.name}
                  {u.kind === 'agent' && <AgentBadge />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="composer-foot">
          <span className="hint">Ctrl+Enter to send</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={!body.trim() || sending} aria-label="Send comment">
            <ArrowUp />
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
