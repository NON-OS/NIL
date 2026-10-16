import { useMemo, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import router from '../../lib/router';
import searchHelp from '../../lib/help/searchHelp';
import type HelpTopic from '../../types/HelpTopic';

interface Props {
  topics: HelpTopic[];
  current: string;
  query: string;
  onQuery: (query: string) => void;
}

// The left side of the help center: a search box over every page, and the pages grouped the
// way the docs index groups them.
export default function TopicList({ topics, current, query, onQuery }: Props) {
  const hits = useMemo(() => searchHelp(topics, query), [topics, query]);
  const link = (slug: string, children: ReactNode, className = 'help-topic') => (
    <a key={slug} className={className} href={`/help/${slug}`} onClick={router.link(`/help/${slug}`)} aria-current={slug === current ? 'page' : undefined}>
      {children}
    </a>
  );

  return (
    <nav className="help-nav" aria-label="Help topics">
      <label className="help-search">
        <Search />
        <input className="input" type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search help" aria-label="Search help" />
      </label>
      <div className="help-topics">
        {query.trim() ? (
          hits.length ? (
            hits.map(({ topic, snippet }) =>
              link(
                topic.slug,
                <>
                  <strong>{topic.title}</strong>
                  {snippet && (
                    <small>
                      {snippet.before}
                      <mark>{snippet.match}</mark>
                      {snippet.after}
                    </small>
                  )}
                </>,
                'help-topic help-hit',
              ),
            )
          ) : (
            <p className="muted help-empty">Nothing in the help matches “{query.trim()}”. Try a shorter word.</p>
          )
        ) : (
          topics.map((t, i) => (
            <div key={t.slug}>
              {t.group !== topics[i - 1]?.group && <div className="eyebrow help-group">{t.group}</div>}
              {link(t.slug, t.title)}
            </div>
          ))
        )}
      </div>
    </nav>
  );
}
