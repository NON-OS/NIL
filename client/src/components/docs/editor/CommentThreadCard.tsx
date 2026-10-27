import { useState } from 'react';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import Avatar from '../../ui/Avatar';
import useStore from '../../../state/useStore';
import dates from '../../../lib/dates';
import type { CommentThread } from './docComments';

interface Props {
  thread: CommentThread;
  active: boolean;
  orphaned: boolean;
  canDelete: boolean;
  onFocus: () => void;
  onReply: (text: string) => void;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
}

// One comment thread: the words it's about, the messages, a reply box, resolve and delete.
export default function CommentThreadCard({ thread, active, orphaned, canDelete, onFocus, onReply, onResolve, onDelete }: Props) {
  const users = useStore((s) => s.users);
  const [reply, setReply] = useState('');
  const send = () => {
    if (!reply.trim()) return;
    onReply(reply.trim());
    setReply('');
  };
  return (
    <article className={`doc-thread${active ? ' active' : ''}${thread.resolved ? ' resolved' : ''}`} onClick={onFocus} aria-label={`Comment on “${thread.quote}”`}>
      <blockquote className="doc-thread-quote">{orphaned ? <em>The text this was about was deleted.</em> : thread.quote}</blockquote>
      {thread.messages.map((m) => {
        const who = users[m.by];
        return (
          <div key={m.id} className="doc-thread-msg">
            {who && <Avatar user={who} size={20} />}
            <div>
              <div className="doc-thread-meta">
                <strong>{who?.name ?? 'Someone'}</strong> <time dateTime={new Date(m.at).toISOString()}>{dates.ago(m.at)}</time>
              </div>
              <p>{m.text}</p>
            </div>
          </div>
        );
      })}
      {!thread.resolved && (
        <form className="doc-thread-reply" onSubmit={(e) => (e.preventDefault(), send())}>
          <textarea className="textarea" rows={1} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send()} placeholder="Reply" aria-label="Reply" />
          {reply.trim() && (
            <button type="submit" className="btn btn-sm btn-primary">
              Reply
            </button>
          )}
        </form>
      )}
      <div className="doc-thread-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => (e.stopPropagation(), onResolve(!thread.resolved))}>
          {thread.resolved ? <RotateCcw /> : <Check />} {thread.resolved ? 'Reopen' : 'Resolve'}
        </button>
        {canDelete && (
          <button type="button" className="btn btn-sm btn-ghost" aria-label="Delete thread" onClick={(e) => (e.stopPropagation(), onDelete())}>
            <Trash2 />
          </button>
        )}
      </div>
    </article>
  );
}
