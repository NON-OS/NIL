import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import domain from '../lib/domain.js';
import calendar from '../lib/calendar.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import toProject from '../mappers/toProject.js';
import guestScope from '../services/guestScope.js';
import createTask from '../services/createTask.js';
import firstRunState from './firstRunState.js';
import sampleContent from './sampleContent.js';

// Adds the sample project for the person who set up the workspace. The tasks go through
// createTask like any other, so they show up live, get a history and are found by search.
// Due dates count from the person's own today, not the server's.
export default function addSample(user, today) {
  const state = firstRunState.of(user.id);
  if (!state) throw HttpError.forbidden('The sample project is part of getting started, for whoever set up this workspace.');
  if (state.sample && sql.get('SELECT 1 FROM projects WHERE id = ?', state.sample.projectId)) throw new HttpError(409, 'The sample project is already here.');

  const { project, tasks } = sampleContent;
  const projectId = newId();
  const taskIds = sql.tx(() => {
    const position = (sql.get('SELECT MAX(position) AS m FROM projects').m ?? 0) + 1024;
    sql.run(
      'INSERT INTO projects (id, name, key, color, description, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      projectId, project.name, project.key, domain.colors[1], project.description, position, user.id, Date.now(),
    );
    const made = toProject(sql.get('SELECT * FROM projects WHERE id = ?', projectId));
    hub.broadcast((viewer) => (guestScope.of(viewer.id) ? null : { type: 'project', project: made }));
    // new tasks land on top of their column, so the last one made shows first
    return [...tasks].reverse().map((t) =>
      createTask(user, {
        title: t.title,
        description: t.description ?? '',
        status: t.status,
        priority: t.priority,
        dueDate: calendar.addDays(today, t.due),
        assigneeId: t.mine ? user.id : null,
        projectId,
        checklist: t.checklist ?? [],
      }).id,
    );
  });
  firstRunState.update(user.id, { sample: { projectId, taskIds } });
  return { projectId, taskIds };
}
