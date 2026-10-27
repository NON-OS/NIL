import linkParts from '../../lib/linkParts';
import cx from '../../lib/cx';
import type User from '../../types/User';

// Message words as text nodes, never as markup: whatever a sender typed shows exactly as typed.
// Web links open in a new tab without telling the site where they came from.
export default function MessageText({ text, people, me }: { text: string; people: User[]; me: string | undefined }) {
  return (
    <div className="msg-text">
      {linkParts(text, people).map((p, i) =>
        p.kind === 'link' ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">
            {p.text}
          </a>
        ) : p.kind === 'mention' ? (
          <span key={i} className={cx('mention', p.userId === me && 'me')}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </div>
  );
}
