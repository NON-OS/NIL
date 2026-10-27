import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Paperclip, SendHorizontal, X } from 'lucide-react';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import useChat from '../../state/useChat';
import useTicker from '../../hooks/useTicker';
import toast from '../../state/toast';
import socket from '../../realtime/socket';
import chatSend from '../../actions/chat/chatSend';
import chatContent from '../../lib/chatContent';
import fuzzyScore from '../../lib/fuzzyScore';
import formatBytes from '../../lib/formatBytes';
import type ChatChannel from '../../types/ChatChannel';
import type User from '../../types/User';

interface Props {
  channel: ChatChannel;
  threadId: string | null;
  placeholder: string;
  // why nothing can be sent here yet, such as a key that hasn't arrived
  blocked: string | null;
  onEditLast: () => void;
}

export interface ComposerHandle {
  focus: () => void;
}

const TYPING_EVERY = 2500;

// The words before the caret that start with @, for the mention menu.
function mentionAt(text: string, caret: number) {
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null;
}

// Writing a message. Enter sends, Shift+Enter starts a new line, @ mentions someone in the
// conversation, files come from the clip button, a paste or a drop, and Up in an empty box edits
// your last message. A message written offline waits in a queue and goes when you're back.
const Composer = forwardRef<ComposerHandle, Props>(function Composer({ channel, threadId, placeholder, blocked, onEditLast }, handle) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  // typing hints are per timeline: the conversation, or one thread in it
  const typing = useChat((s) => s.typing[channel.id]?.[threadId ?? 'main']);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mention, setMention] = useState<{ start: number; query: string; active: number } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  useImperativeHandle(handle, () => ({ focus: () => area.current?.focus() }), []);

  const people = useMemo(() => channel.members.map((id) => users[id]).filter((u): u is User => Boolean(u) && u.id !== me), [channel.members, users, me]);
  const choices = useMemo(() => (mention ? people.filter((u) => !mention.query || fuzzyScore(u.name, mention.query) > 0).slice(0, 6) : []), [mention, people]);
  // the hint lasts a few seconds, so the clock runs only while someone is typing
  useTicker(Object.values(typing ?? {}).some((until) => until > Date.now()));
  const typers = Object.entries(typing ?? {})
    .filter(([id, until]) => until > Date.now() && id !== me)
    .map(([id]) => users[id]?.name ?? 'Someone');

  const resize = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const add = (list: FileList | File[] | null) => {
    const next = [...files, ...Array.from(list ?? [])].slice(0, chatContent.limits.files);
    if (files.length + (list?.length ?? 0) > chatContent.limits.files) toast.show(`Up to ${chatContent.limits.files} files in one message.`);
    setFiles(next);
  };

  const send = () => {
    const words = text.trim();
    if ((!words && !files.length) || blocked) return;
    if (words.length > chatContent.limits.text) return toast.show('That message is too long. Split it in two.', { tone: 'error' });
    const mentions = people.filter((u) => words.includes(`@${u.name}`)).map((u) => u.id);
    const kept = { text, files };
    chatSend.message(channel, { text: words, files, threadId, mentions }).catch((err) => {
      // nothing was sealed: the words come back to the box
      setText(kept.text);
      setFiles(kept.files);
      toast.error(err);
    });
    setText('');
    setFiles([]);
    setMention(null);
    requestAnimationFrame(resize);
  };

  const pick = (user: User) => {
    if (!mention) return;
    const next = `${text.slice(0, mention.start)}@${user.name} ${text.slice(area.current?.selectionStart ?? text.length)}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => area.current?.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && choices.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setMention({ ...mention, active: (mention.active + step + choices.length) % choices.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        return pick(choices[mention.active] ?? choices[0]);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        return setMention(null);
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === 'ArrowUp' && !text) {
      e.preventDefault();
      onEditLast();
    }
  };

  const onChange = (value: string, caret: number) => {
    setText(value);
    const at = mentionAt(value, caret);
    setMention(at ? { ...at, active: 0 } : null);
    resize();
    if (value && Date.now() - lastTyping.current > TYPING_EVERY) {
      lastTyping.current = Date.now();
      socket.chatTyping(channel.id, threadId);
    }
  };

  return (
    <div className="chat-composer" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), add(e.dataTransfer.files))}>
      {mention && choices.length > 0 && (
        <ul className="chat-mentions" role="listbox" aria-label="People to mention">
          {choices.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === mention.active} onMouseDown={(e) => (e.preventDefault(), pick(u))}>
              <Avatar user={u} size={20} /> {u.name}
            </li>
          ))}
        </ul>
      )}
      <div className="chat-composer-box">
        {files.length > 0 && (
          <div className="chat-composer-files">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="chat-composer-file">
                {f.name} <small className="muted">{formatBytes(f.size)}</small>
                <button type="button" className="icon-only" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={blocked ?? placeholder}
          aria-label={placeholder}
          disabled={Boolean(blocked)}
          onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              add(e.clipboardData.files);
            }
          }}
        />
        <div className="chat-composer-bar">
          <input ref={picker} type="file" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
          <button type="button" className="icon-btn" onClick={() => picker.current?.click()} disabled={Boolean(blocked)} aria-label="Attach files" title="Attach files">
            <Paperclip size={16} />
          </button>
          <span className="hint">Encrypted. Pictures lose their location before they’re sent.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={Boolean(blocked) || (!text.trim() && !files.length)} aria-label="Send">
            <SendHorizontal size={15} />
          </button>
        </div>
      </div>
      <div className="chat-composer-typing" aria-live="polite">
        {typers.length ? `${typers.slice(0, 3).join(', ')} ${typers.length === 1 ? 'is' : 'are'} typing…` : ''}
      </div>
    </div>
  );
});

export default Composer;
