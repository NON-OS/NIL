import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import MessageList from './MessageList';
import Composer, { type ComposerHandle } from './Composer';
import useChat from '../../state/useChat';
import useStore from '../../state/useStore';
import chatTimeline from '../../actions/chat/chatTimeline';
import type ChatChannel from '../../types/ChatChannel';

// A thread beside its conversation: the message it started from and the replies under it, with
// a box of its own. Escape closes it.
export default function ThreadPanel({ channel, rootId, onClose }: { channel: ChatChannel; rootId: string; onClose: () => void }) {
  const key = chatTimeline.keyOf(channel.id, rootId);
  const timeline = useChat((s) => s.timelines[key]);
  const me = useStore((s) => s.me?.id);
  const [editing, setEditing] = useState<string | null>(null);
  const composer = useRef<ComposerHandle>(null);

  useEffect(() => {
    void chatTimeline.latest(channel, rootId);
    composer.current?.focus();
  }, [channel.id, rootId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !(e.target as HTMLElement).closest('.chat-pane')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const editLast = () => {
    const mine = [...(timeline?.items ?? [])].reverse().find((m) => m.senderId === me && m.type === 'message' && m.state === 'ok' && m.seq && m.threadId === rootId);
    if (mine) setEditing(mine.id);
  };

  return (
    <aside className="chat-thread" aria-label="Thread">
      <header className="chat-pane-head">
        <h2>
          <span>Thread</span>
        </h2>
        <div className="actions">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close thread">
            <X />
          </button>
        </div>
      </header>
      {timeline && (
        <MessageList
          channel={channel}
          timeline={timeline}
          inThread
          editing={editing}
          onEditing={setEditing}
          onThread={() => {}}
          onOlder={() => void chatTimeline.older(channel, rootId)}
          onLeave={() => composer.current?.focus()}
          label="Replies in this thread"
        />
      )}
      <Composer ref={composer} channel={channel} threadId={rootId} placeholder="Reply in thread" blocked={!channel.wrappedKey ? 'Waiting for a key.' : null} onEditLast={editLast} />
    </aside>
  );
}
