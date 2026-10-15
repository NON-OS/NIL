import { useCallback, useEffect, useState } from 'react';
import { Plus, Vote } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import ProposalCard from '../components/votes/ProposalCard';
import NewProposalModal from '../components/votes/NewProposalModal';
import PlanNotice from '../components/plan/PlanNotice';
import useStore from '../state/useStore';
import toast from '../state/toast';
import votes from '../actions/votes';
import type Proposal from '../types/Proposal';
import isAdminUser from '../lib/isAdmin';

export default function VotesView() {
  const isAdmin = useStore((s) => isAdminUser(s.me));
  // bumped by the server whenever a vote is cast, opened or closed
  const revision = useStore((s) => s.proposalsRev);
  const [list, setList] = useState<Proposal[] | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => votes.list().then(setList).catch(toast.error), []);
  useEffect(() => {
    refresh();
  }, [refresh, revision]);

  const start = isAdmin && (
    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
      <Plus /> New vote
    </button>
  );

  return (
    <div className="main">
      <ViewHeader title="Votes" icon={<Vote size={17} />} subtitle="Decide together. Every ballot is signed by a wallet." actions={start} />
      <div className="page page-narrow">
        <PlanNotice what="New votes" />
        {!list ? (
          <Spinner size={20} />
        ) : list.length ? (
          <div className="proposals">
            {list.map((p) => (
              <ProposalCard key={p.id} proposal={p} onChange={refresh} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Vote />} title="No votes yet" actions={start}>
            Ask the team a question and let everyone answer with a signed ballot. Choose one person one vote, or weight it by NOX held. Who voted what stays private.
          </EmptyState>
        )}
      </div>
      {creating && <NewProposalModal onClose={() => setCreating(false)} onCreated={refresh} />}
    </div>
  );
}
