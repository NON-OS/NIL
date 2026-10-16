import { useState } from 'react';
import Avatar from '../ui/Avatar';
import AgentBadge from '../agents/AgentBadge';
import Markdown from '../ui/Markdown';
import useStore from '../../state/useStore';
import detail from '../../actions/detail';
import dates from '../../lib/dates';
import type Comment from '../../types/Comment';
import isAdminUser from '../../lib/isAdmin';

export default function CommentItem({ comment }: { comment: Comment }) {
  const author = useStore((s) => (comment.authorId ? s.users[comment.authorId] : undefined));
  const me = useStore((s) => s.me);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const mine = comment.authorId === me?.id;
  const canDelete = mine || isAdminUser(me);

  return (
    <li className="comment">
      <Avatar user={author} size={26} />
      <div className="comment-body">
        <div className="comment-head">
          <strong>{author?.name ?? 'Former member'}</strong>
          {author?.kind === 'agent' && <AgentBadge />}
          <time className="muted" dateTime={new Date(comment.createdAt).toISOString()} title={dates.dateTime(comment.createdAt)}>
            {dates.ago(comment.createdAt)}
            {comment.editedAt && ' · edited'}
          </time>
          {!editing && (
            <span className="comment-actions">
              {mine && !comment.locked && (
                <button type="button" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={() => detail.deleteComment(comment)}>
                  Delete
                </button>
              )}
            </span>
          )}
        </div>
        {editing ? (
          <div className="comment-edit">
            <textarea className="textarea" value={draft} autoFocus rows={3} onChange={(e) => setDraft(e.target.value)} aria-label="Edit comment" />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!draft.trim()}
                onClick={async () => {
                  await detail.editComment(comment, draft.trim());
                  setEditing(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : comment.locked ? (
          <p className="comment-locked">Encrypted comment. Unlock to read it.</p>
        ) : (
          <Markdown text={comment.body} />
        )}
      </div>
    </li>
  );
}
