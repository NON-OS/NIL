import { useMemo, useState } from 'react';
import { Plus, Target } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import GoalCard from '../components/goals/GoalCard';
import GoalModal from '../components/goals/GoalModal';
import EmptyState from '../components/ui/EmptyState';
import useStore from '../state/useStore';
import useTasks from '../hooks/useTasks';
import type Goal from '../types/Goal';

export default function GoalsView() {
  const goalMap = useStore((s) => s.goals);
  const tasks = useTasks();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const goals = useMemo(() => Object.values(goalMap).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.position - b.position), [goalMap]);
  const live = editing && editing !== 'new' ? goalMap[editing.id] : undefined;

  return (
    <div className="main">
      <ViewHeader
        title="Goals"
        icon={<Target size={17} />}
        subtitle="The outcomes your tasks add up to"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus /> New goal
          </button>
        }
      />
      <div className="page">
        {goals.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {goals.map((g) => (
              <GoalCard key={g.id} goal={g} tasks={tasks} onOpen={() => setEditing(g)} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Target />} title="Set your first goal" actions={<button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Plus /> New goal</button>}>
            Pick one or two outcomes for this quarter, like “Reach $20k MRR” or “Launch in Germany”. Link tasks to them and watch progress add up.
          </EmptyState>
        )}
      </div>
      {editing === 'new' && <GoalModal onClose={() => setEditing(null)} />}
      {live && <GoalModal goal={live} onClose={() => setEditing(null)} />}
    </div>
  );
}
