import { memo, useState } from 'react';
import { CircleAlert, Clock, Lock, MessageSquareReply, Pencil, ShieldAlert, Trash2 } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Spinner from '../ui/Spinner';
import ConfirmButton from '../ui/ConfirmButton';
import MessageText from './MessageText';
import ChatFileView from './ChatFileView';
import EmojiPicker from './EmojiPicker';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import chatSend from '../../actions/chat/chatSend';
import chatEdit from '../../actions/chat/chatEdit';
import dates from '../../lib/dates';
import timeLeft from '../../lib/timeLeft';
import cx from '../../lib/cx';
import type { Reaction } from '../../lib/chatRows';
import type ChatItem from '../../types/ChatItem';
import type ChatChannel from '../../types/ChatChannel';
import type User from '../../types/User';

interface Props {
  item: ChatItem;
  channel: ChatChannel;
  grouped: boolean;
  reactions: Reaction[];
  index: number;
  inThread: boolean;
  editing: boolean;
  onEditing: (id: string | null) => void;
  onThread: (id: string) => void;
}

function Body({ item, people, me }: { item: ChatItem; people: User[]; me: string | undefined }) {
  if (item.state === 'locked') {
    return (
      <p className="msg-gone">
        <Lock size={12} /> Encrypted under a key this tab doesn’t hold yet.
      </p>
    );
  }
  if (item.state === 'unverified') {
    return (
      <p className="msg-gone" style={{ color: 'var(--danger)' }}>
        <ShieldAlert size={12} /> Nil couldn’t confirm who wrote this, so it isn’t shown.
      </p>
    );
  }
  if (item.type === 'deleted') return <p className="msg-gone">This message was deleted.</p>;
  return <MessageText text={item.text} people={people} me={me} />;
}

// One message: who and when, the words, files, reactions and replies, and on hover or focus the
// things to do with it. Only the sender can edit or delete it.
function MessageRow({ item, channel, grouped, reactions, index, inThread, editing, onEditing, onThread }: Props) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  const [draft, setDraft] = useState(item.text);
  const sender = item.senderId ? users[item.senderId] : null;
  const mine = item.senderId === me && item.seq > 0;
  const live = item.state === 'ok' && item.type === 'message';
  const people = channel.members.map((id) => users[id]).filter(Boolean);
  const mentionsMe = live && me !== undefined && item.mentions.includes(me) && item.senderId !== me;

  const run = (fn: () => Promise<unknown>) => fn().catch(toast.error);
  const save = () => {
    onEditing(null);
    if (draft.trim() && draft !== item.text) run(() => chatEdit.edit(item, draft));
  };
  const label = `${sender?.name ?? 'Someone'}, ${dates.time(item.sentAt)}`;

  return (
    <article className={cx('msg', grouped && 'grouped', mentionsMe && 'mentions-me')} data-index={index} tabIndex={-1} aria-label={label}>
      {grouped ? <time className="stamp">{dates.clock(item.sentAt)}</time> : <Avatar user={sender} size={36} />}
      <div>
        {!grouped && (
          <div className="msg-head">
            <strong>{sender?.name ?? 'Someone'}</strong>
            <time dateTime={new Date(item.sentAt).toISOString()}>{dates.time(item.sentAt)}</time>
          </div>
        )}
        {editing ? (
          <div className="chat-composer-box" style={{ marginTop: 4 }}>
            <textarea
              autoFocus
              rows={2}
              value={draft}
              aria-label="Edit message"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  save();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onEditing(null);
                }
              }}
            />
            <div className="chat-composer-bar">
              <span className="hint">Enter to save, Esc to cancel</span>
              <button type="button" className="btn btn-sm" onClick={() => onEditing(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={save}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <Body item={item} people={people} me={me} />
        )}
        {live && item.files.length > 0 && (
          <div className="msg-files">
            {item.files.map((f, i) => (
              <ChatFileView key={f.id || i} channelId={channel.id} file={f} />
            ))}
          </div>
        )}
        {(item.editedAt || item.expiresAt) && live && (
          <span className="msg-meta">
            {item.editedAt ? '(edited) ' : ''}
            {item.expiresAt ? (
              <>
                <Clock size={10} /> disappears, {timeLeft(item.expiresAt)}
              </>
            ) : null}
          </span>
        )}
        {item.pending && (
          <span className={cx('msg-state', item.pending === 'failed' && 'failed')} role={item.pending === 'failed' ? 'alert' : undefined}>
            {item.pending === 'failed' ? <CircleAlert /> : item.pending === 'sending' ? <Spinner size={11} /> : <Clock />}
            {item.pending === 'queued' ? 'Queued. It goes when you’re back online.' : item.pending === 'sending' ? 'Sending…' : `Not sent. ${item.error ?? ''}`}
            {item.pending === 'failed' && (
              <>
                <button type="button" onClick={() => chatSend.retry(item.id)}>
                  Try again
                </button>
                <button type="button" onClick={() => chatSend.discard(item)}>
                  Discard
                </button>
              </>
            )}
          </span>
        )}
        {reactions.length > 0 && (
          <div className="msg-reactions">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={cx('reaction', r.mine && 'mine')}
                aria-pressed={Boolean(r.mine)}
                title={r.people.map((id) => users[id]?.name ?? 'Someone').join(', ')}
                aria-label={`${r.emoji} ${r.people.length}, ${r.mine ? 'remove your reaction' : 'react too'}`}
                onClick={() => run(async () => (r.mine ? chatEdit.remove(r.mine) : chatSend.react(channel, item, r.emoji)))}
              >
                {r.emoji} <span className="num">{r.people.length}</span>
              </button>
            ))}
          </div>
        )}
        {!inThread && item.replies > 0 && (
          <button type="button" className="msg-replies" onClick={() => onThread(item.id)}>
            <MessageSquareReply size={14} /> {item.replies === 1 ? '1 reply' : `${item.replies} replies`}
            {item.lastReplyAt && <span className="muted">· {dates.ago(item.lastReplyAt)}</span>}
          </button>
        )}
      </div>
      {live && item.seq > 0 && !editing && (
        <div className="msg-tools" role="toolbar" aria-label="Message actions">
          <EmojiPicker onPick={(emoji) => chatSend.react(channel, item, emoji)} />
          {!inThread && !item.threadId && (
            <button type="button" className="icon-btn" onClick={() => onThread(item.id)} aria-label="Reply in thread" title="Reply in thread">
              <MessageSquareReply size={15} />
            </button>
          )}
          {mine && (
            <>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setDraft(item.text);
                  onEditing(item.id);
                }}
                aria-label="Edit message"
                title="Edit"
              >
                <Pencil size={15} />
              </button>
              <ConfirmButton className="icon-btn" label="Delete message" confirmLabel="Delete?" onConfirm={() => run(() => chatEdit.remove(item))}>
                <Trash2 size={15} />
              </ConfirmButton>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export default memo(MessageRow);
