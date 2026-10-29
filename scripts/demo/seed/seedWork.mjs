import api from '../lib/api.mjs';
import step from '../lib/step.mjs';
import backdate from './backdate.mjs';
import myDay from './myDay.mjs';
import plan from './plan.mjs';
import taskComments from './taskComments.mjs';
import tasks from './tasks.mjs';
import votes from './votes.mjs';
import workspace from './workspace.mjs';

// Part one, through the API from each person's own page: the team, projects, labels, goals,
// about eighty tasks with comments, Ada's day, votes, then twelve weeks of history. A workspace
// that has the projects already is left as it is.
export default async function seedWork(browser, server) {
  const team = await workspace(browser, server);
  step(`people: ${Object.keys(team.uid).join(', ')}`);
  const closeAll = () => Promise.all(Object.values(team.pages).map((p) => p.context().close()));
  const { projects } = await api(team.pages.ada, 'GET', '/bootstrap');
  if (projects.some((p) => p.name === 'Atlas 2.0')) {
    step('projects and tasks are there already');
    return closeAll();
  }
  const ids = await plan(team);
  step('projects, labels and goals');
  const made = await tasks(team, ids);
  step(`${Object.keys(made.task).length} open tasks and ${made.done.length} done`);
  await taskComments(team, made.task);
  await myDay(team, made);
  step('comments, My Day, reminders and time');
  await votes(team);
  step('votes');
  await closeAll();
  backdate(made);
  step('history spread over twelve weeks');
}
