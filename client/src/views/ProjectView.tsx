import './ProjectView.css';
import { useMemo, useState } from 'react';
import { Archive, Kanban, List, Pencil, Plus } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import FilterBar from '../components/shell/FilterBar';
import ListOptions from '../components/shell/ListOptions';
import TaskBoard from '../components/task/TaskBoard';
import TaskList from '../components/task/TaskList';
import ProjectModal from '../components/overlays/ProjectModal';
import Meter from '../components/charts/Meter';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import useStore from '../state/useStore';
import useTasks from '../hooks/useTasks';
import useFilter from '../hooks/useFilter';
import useListPrefs from '../hooks/useListPrefs';
import ui from '../actions/ui';
import filterTasks from '../lib/filterTasks';
import storage from '../lib/storage';
import meta from '../lib/meta';
import dates from '../lib/dates';

export default function ProjectView({ projectId }: { projectId: string }) {
  const project = useStore((s) => s.projects[projectId]);
  const lead = useStore((s) => (project?.leadId ? s.users[project.leadId] : undefined));
  const meId = useStore((s) => s.me?.id ?? null);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const all = useTasks();
  const [mode, setModeState] = useState<'board' | 'list'>(() => storage.get(`project-mode:${projectId}`, 'board'));
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useFilter(`project:${projectId}`);
  const [prefs, setPrefs] = useListPrefs(`project:${projectId}`, { groupBy: 'status', sortBy: 'manual' });

  const inProject = useMemo(() => all.filter((t) => t.projectId === projectId && t.status !== 'canceled'), [all, projectId]);
  const tasks = useMemo(() => filterTasks(inProject, filter, { meId, prefix, keepClosed: mode === 'board' }), [inProject, filter, meId, prefix, mode]);
  const done = inProject.filter((t) => t.status === 'done').length;
  const overdue = inProject.filter((t) => !meta.isClosed(t.status) && t.dueDate && t.dueDate < dates.today()).length;

  if (!project) {
    return (
      <div className="main">
        <ViewHeader title="Project not found" />
        <EmptyState icon={<Archive />} title="This project was deleted">
          Its tasks moved to No project and are still on the board.
        </EmptyState>
      </div>
    );
  }

  const setMode = (m: 'board' | 'list') => {
    setModeState(m);
    storage.set(`project-mode:${projectId}`, m);
  };
  const defaults = { projectId };

  return (
    <div className={mode === 'board' ? 'view-fill' : 'main'}>
      <ViewHeader
        title={project.name}
        icon={<span style={{ width: 12, height: 12, borderRadius: 4, background: project.color, flex: 'none' }} />}
        subtitle={project.archived ? 'Archived' : <span className="mono">{project.key}</span>}
        actions={
          <>
            <div className="view-switch" role="group" aria-label="Layout">
              <button type="button" aria-pressed={mode === 'board'} onClick={() => setMode('board')}>
                <Kanban /> Board
              </button>
              <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
                <List /> List
              </button>
            </div>
            <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit project" title="Edit project">
              <Pencil />
            </button>
            <button type="button" className="btn btn-primary" onClick={() => ui.quickAdd(defaults)}>
              <Plus /> New task
            </button>
          </>
        }
      />
      <div className="project-hero">
        <p>{project.description || <span className="muted">No description yet. Say what this project is for so everyone pulls the same way.</span>}</p>
        <div className="stats">
          {lead && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Avatar user={lead} size={20} /> <strong>{lead.name}</strong> leads
            </span>
          )}
          {overdue > 0 && <span style={{ color: 'var(--danger)' }}>{overdue} overdue</span>}
          <Meter label="Progress" value={done} total={inProject.length} color={project.color} />
        </div>
      </div>
      <FilterBar filter={filter} onChange={setFilter} showProjects={false} showClosedToggle={mode === 'list'}>
        {mode === 'list' && <ListOptions groupBy={prefs.groupBy} sortBy={prefs.sortBy} onGroup={(groupBy) => setPrefs({ groupBy })} onSort={(sortBy) => setPrefs({ sortBy })} />}
      </FilterBar>
      {inProject.length === 0 ? (
        <EmptyState icon={<Kanban />} title="No tasks in this project yet" actions={<button type="button" className="btn btn-primary" onClick={() => ui.quickAdd(defaults)}><Plus /> Add a task</button>}>
          Tip: type “+{project.key.toLowerCase()}” in any new task to drop it here.
        </EmptyState>
      ) : mode === 'board' ? (
        <div className="view-body">
          <TaskBoard tasks={tasks} showProject={false} defaults={defaults} />
        </div>
      ) : (
        <TaskList tasks={tasks} groupBy={prefs.groupBy} sortBy={prefs.sortBy} defaults={defaults} />
      )}
      {editing && <ProjectModal project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}
