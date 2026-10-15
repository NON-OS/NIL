import { useMemo } from 'react';
import { Download, List, Plus } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import FilterBar from '../components/shell/FilterBar';
import ListOptions from '../components/shell/ListOptions';
import TaskList from '../components/task/TaskList';
import EmptyState from '../components/ui/EmptyState';
import useStore from '../state/useStore';
import useTasks from '../hooks/useTasks';
import useFilter from '../hooks/useFilter';
import useListPrefs from '../hooks/useListPrefs';
import ui from '../actions/ui';
import filterTasks from '../lib/filterTasks';

export default function ListView() {
  const all = useTasks();
  const meId = useStore((s) => s.me?.id ?? null);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const [filter, setFilter] = useFilter('list');
  const [prefs, setPrefs] = useListPrefs('list', { groupBy: 'status', sortBy: 'priority' });
  const tasks = useMemo(() => filterTasks(all, filter, { meId, prefix }), [all, filter, meId, prefix]);

  return (
    <div className="main">
      <ViewHeader
        title="All tasks"
        icon={<List size={17} />}
        subtitle={`${tasks.length} shown`}
        actions={
          <>
            <a className="btn btn-ghost" href="/api/export/tasks.csv" title="Download every task as a spreadsheet">
              <Download /> Export
            </a>
            <button type="button" className="btn btn-primary" onClick={() => ui.quickAdd()}>
              <Plus /> New task
            </button>
          </>
        }
      />
      <FilterBar filter={filter} onChange={setFilter}>
        <ListOptions groupBy={prefs.groupBy} sortBy={prefs.sortBy} onGroup={(groupBy) => setPrefs({ groupBy })} onSort={(sortBy) => setPrefs({ sortBy })} />
      </FilterBar>
      {tasks.length ? (
        <TaskList tasks={tasks} groupBy={prefs.groupBy} sortBy={prefs.sortBy} />
      ) : (
        <EmptyState icon={<List />} title={all.length ? 'No tasks match these filters' : 'No tasks yet'}>
          {all.length ? 'Try clearing a filter or turning on “Show completed”.' : 'Press C anywhere to create your first task.'}
        </EmptyState>
      )}
    </div>
  );
}
