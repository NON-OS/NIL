import { useEffect, type MouseEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import Markdown from '../ui/Markdown';
import router from '../../lib/router';
import helpPath from '../../lib/help/helpPath';
import type HelpTopic from '../../types/HelpTopic';

function scrollTo(hash: string) {
  const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  if (target) target.scrollIntoView({ block: 'start' });
  else window.scrollTo({ top: 0 });
}

// One help page. Links to other docs files open those pages here; a link to a section of the
// page it's on just scrolls there.
export default function HelpArticle({ topic }: { topic: HelpTopic }) {
  useEffect(() => scrollTo(location.hash), [topic.slug]);

  const follow = (to: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const [path, hash = ''] = to.split('#');
    if (path === location.pathname) {
      history.replaceState(null, '', to);
      scrollTo(hash && `#${hash}`);
    } else {
      router.navigate(to);
    }
  };

  return (
    <article className="help-article">
      {topic.slug && (
        <a className="btn btn-ghost btn-sm help-back" href="/help" onClick={router.link('/help')}>
          <ArrowLeft /> All topics
        </a>
      )}
      <Markdown
        text={topic.text}
        anchors
        renderLink={(href, label, key) => {
          const to = helpPath(href, topic.slug);
          return to ? <a key={key} href={to} onClick={follow(to)}>{label}</a> : null;
        }}
      />
    </article>
  );
}
