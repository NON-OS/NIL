import { Compass } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import EmptyState from '../components/ui/EmptyState';
import router from '../lib/router';

export default function NotFoundView() {
  return (
    <div className="main">
      <ViewHeader title="Not found" />
      <EmptyState icon={<Compass />} title="Nothing lives at this address" actions={<button type="button" className="btn btn-primary" onClick={() => router.navigate('/')}>Go to My work</button>}>
        The link may be old, or the page was moved.
      </EmptyState>
    </div>
  );
}
