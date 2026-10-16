import './ProjectView.css';
import { useMemo, useState } from 'react';
import { Archive, Kanban, List, Pencil, Plus, Presentation, Share2 } from 'lucide-react';
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
import useArchiveSearch from '../hooks/useArchiveSearch';
import ui from '../actions/ui';
import filterTasks from '../lib/filterTasks';
import storage from '../lib/storage';
import meta from '../lib/meta';
import dates from '../lib/dates';
import decks from '../actions/decks';
import ShareLinkModal from '../components/share/ShareLinkModal';
import ArchiveMore from '../components/task/ArchiveMore';
import projectProgress from '../lib/projectProgress';

export default function ProjectView({ projectId }: { projectId: string }) {
  const project = useStore((s) => s.projects[projectId]);
  const lead = useStore((s) => (project?.leadId ? s.users[project.leadId] : undefined));
  const meId = useStore((s) => s.me?.id ?? null);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const all = useTasks();
  const archive = useStore((s) => s.archive);
  const [mode, setModeState] = useState<'board' | 'list'>(() => storage.get(`project-mode:${projectId}`, 'board'));
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canShare = useStore((s) => s.sharing.shareLinks && !s.guest);
  const isGuest = useStore((s) => s.guest);
  const [filter, setFilter] = useFilter(`project:${projectId}`);
  const [prefs, setPrefs] = useListPrefs(`project:${projectId}`, { groupBy: 'status', sortBy: 'manual' });

  const inProject = useMemo(() => all.filter((t) => t.projectId === projectId && t.status !== 'canceled'), [all, projectId]);
  const tasks = useMemo(() => filterTasks(inProject, filter, { meId, prefix, keepClosed: mode === 'board' }), [inProject, filter, meId, prefix, mode]);
  const progress = useMemo(() => projectProgress(projectId, all, archive), [projectId, all, archive]);
  useArchiveSearch(filter.query, mode === 'list' && filter.showClosed);
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
            {canShare && (
              <button type="button" className="icon-btn" onClick={() => setSharing(true)} aria-label="Share read-only link" title="Share a read-only link">
                <Share2 />
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => decks.open({ kind: 'project', id: project.id })} aria-label="Create a status deck" title="Create a status deck (.pptx)">
              <Presentation />
            </button>
            {!isGuest && (
              <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit project" title="Edit project">
                <Pencil />
              </button>
            )}
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
          <Meter label="Progress" value={progress.done} total={progress.total} color={project.color} />
        </div>
      </div>
      <FilterBar filter={filter} onChange={setFilter} showProjects={false} showClosedToggle={mode === 'list'}>
        {mode === 'list' && <ListOptions groupBy={prefs.groupBy} sortBy={prefs.sortBy} onGroup={(groupBy) => setPrefs({ groupBy })} onSort={(sortBy) => setPrefs({ sortBy })} />}
      </FilterBar>
      {inProject.length === 0 && progress.total === 0 ? (
        <EmptyState icon={<Kanban />} title="No tasks in this project yet" actions={<button type="button" className="btn btn-primary" onClick={() => ui.quickAdd(defaults)}><Plus /> Add a task</button>}>
          Tip: type “+{project.key.toLowerCase()}” in any new task to drop it here.
        </EmptyState>
      ) : mode === 'board' ? (
        <div className="view-body">
          <TaskBoard tasks={tasks} showProject={false} defaults={defaults} />
        </div>
      ) : (
        <TaskList tasks={tasks} groupBy={prefs.groupBy} sortBy={prefs.sortBy} defaults={defaults} footer={filter.showClosed && <ArchiveMore />} />
      )}
      {editing && <ProjectModal project={project} onClose={() => setEditing(false)} />}
      {sharing && <ShareLinkModal kind="project" targetId={project.id} name={project.name} onClose={() => setSharing(false)} />}
    </div>
  );
}
