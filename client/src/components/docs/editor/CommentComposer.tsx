import { useEffect, useRef, useState } from 'react';

interface Props {
  quote: string;
  onSend: (text: string) => void;
  onCancel: () => void;
}

// Starts a comment thread on the words just selected.
export default function CommentComposer({ quote, onSend, onCancel }: Props) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => box.current?.focus(), []);
  const send = () => text.trim() && onSend(text.trim());
  return (
    <form className="doc-thread active" onSubmit={(e) => (e.preventDefault(), send())} aria-label="New comment">
      <blockquote className="doc-thread-quote">{quote}</blockquote>
      <textarea ref={box} className="textarea" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' && (e.metaKey || e.ctrlKey) ? send() : e.key === 'Escape' && onCancel())} placeholder="Add a comment" aria-label="Comment" />
      <div className="doc-thread-actions">
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={!text.trim()}>
          Comment
        </button>
      </div>
    </form>
  );
}
