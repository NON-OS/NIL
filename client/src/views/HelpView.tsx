import '../components/help/Help.css';
import { useEffect, useState } from 'react';
import { CircleHelp, SearchX } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import EmptyState from '../components/ui/EmptyState';
import NilLogo from '../components/brand/NilLogo';
import TopicList from '../components/help/TopicList';
import HelpArticle from '../components/help/HelpArticle';
import useRoute from '../hooks/useRoute';
import router from '../lib/router';
import helpTopics from '../lib/help/helpTopics';
import cx from '../lib/cx';

// The help center. Signed in it sits in the app; signed out it's a public page, so someone
// who can't get in can still read how signing in works.
export default function HelpView({ standalone = false }: { standalone?: boolean }) {
  const { segments, query: params } = useRoute();
  const slug = segments[1] ?? '';
  const asked = params.get('q') ?? '';
  const [query, setQuery] = useState(asked);
  useEffect(() => setQuery(asked), [asked]);

  const topic = slug ? helpTopics.find(slug) : helpTopics.index;
  const body = (
    <div className={cx('help', slug && 'has-topic', standalone && 'standalone')}>
      <TopicList topics={helpTopics.topics} current={slug} query={query} onQuery={setQuery} />
      {topic ? (
        <HelpArticle key={topic.slug} topic={topic} />
      ) : (
        <EmptyState icon={<SearchX />} title="No help page here" actions={<button type="button" className="btn" onClick={() => router.navigate('/help')}>All topics</button>}>
          The link may be old, or the page was renamed.
        </EmptyState>
      )}
    </div>
  );

  if (standalone) {
    return (
      <div className="verify-standalone">
        <header>
          <NilLogo height={42} />
          <a className="btn btn-sm" href="/" onClick={router.link('/')}>
            Sign in
          </a>
        </header>
        <main>
          <h1 className="sr-only">Help</h1>
          {body}
        </main>
      </div>
    );
  }
  return (
    <div className="main">
      <ViewHeader title="Help" icon={<CircleHelp size={17} />} subtitle="How Nil works, page by page" />
      {body}
    </div>
  );
}
