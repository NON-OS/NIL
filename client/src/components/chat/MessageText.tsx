import { useState } from 'react';
import linkParts from '../../lib/linkParts';
import codeParts from '../../lib/codeParts';
import cx from '../../lib/cx';
import type User from '../../types/User';

// past this a message folds, with a way to read the rest
const LONG_LINES = 14;
const LONG_CHARS = 1400;

function Words({ text, people, me }: { text: string; people: User[]; me: string | undefined }) {
  return linkParts(text, people).map((p, i) =>
    p.kind === 'link' ? (
      // shown left to right on its own, whatever direction the text around it runs
      <bdi key={i} dir="ltr">
        <a href={p.href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">
          {p.text}
        </a>
      </bdi>
    ) : p.kind === 'mention' ? (
      <span key={i} className={cx('mention', p.userId === me && 'me')}>
        {p.text}
      </span>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

// Message words as text nodes, never as markup: whatever a sender typed shows exactly as typed,
// with code in a monospace font. Web links open in a new tab without telling the site where they
// came from. A long message shows its start and folds the rest until asked.
export default function MessageText({ text, people, me, edited = false }: { text: string; people: User[]; me: string | undefined; edited?: boolean }) {
  const long = text.length > LONG_CHARS || text.split('\n').length > LONG_LINES;
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={cx('msg-text', long && !open && 'folded')}>
        {codeParts(text).map((p, i) =>
          p.kind === 'block' ? (
            <pre key={i} className="msg-code" dir="ltr">
              <code>{p.text}</code>
            </pre>
          ) : p.kind === 'code' ? (
            <code key={i} dir="ltr">
              {p.text}
            </code>
          ) : (
            <Words key={i} text={p.text} people={people} me={me} />
          ),
        )}
        {edited && <span className="msg-edited"> (edited)</span>}
      </div>
      {long && (
        <button type="button" className="msg-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show the whole message'}
        </button>
      )}
    </>
  );
}
