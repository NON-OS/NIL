import { useMemo } from 'react';
import { Kanban, Plus } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import FilterBar from '../components/shell/FilterBar';
import TaskBoard from '../components/task/TaskBoard';
import EmptyState from '../components/ui/EmptyState';
import useStore from '../state/useStore';
import useTasks from '../hooks/useTasks';
import useFilter from '../hooks/useFilter';
import ui from '../actions/ui';
import filterTasks from '../lib/filterTasks';

export default function BoardView() {
  const all = useTasks();
  const meId = useStore((s) => s.me?.id ?? null);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const [filter, setFilter] = useFilter('board');
  const tasks = useMemo(() => filterTasks(all, filter, { meId, prefix, keepClosed: true }).filter((t) => t.status !== 'canceled'), [all, filter, meId, prefix]);

  return (
    <div className="view-fill">
      <ViewHeader
        title="Board"
        icon={<Kanban size={17} />}
        subtitle={`${tasks.length} tasks`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => ui.quickAdd()}>
            <Plus /> New task
          </button>
        }
      />
      <FilterBar filter={filter} onChange={setFilter} showClosedToggle={false} />
      <div className="view-body">
        {all.length === 0 ? (
          <EmptyState icon={<Kanban />} title="Your board is empty" actions={<button type="button" className="btn btn-primary" onClick={() => ui.quickAdd()}><Plus /> Create the first task</button>}>
            Tasks flow left to right as work moves from backlog to done. Drag cards between columns.
          </EmptyState>
        ) : (
          <TaskBoard tasks={tasks} />
        )}
      </div>
    </div>
  );
}
