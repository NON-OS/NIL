import sql from '../db/sql.js';

export default function taskContext(task) {
  const project = task.projectId && sql.get('SELECT name, description FROM projects WHERE id = ?', task.projectId);
  const goal = task.goalId && sql.get('SELECT title FROM goals WHERE id = ?', task.goalId);
  return [
    `Task: ${task.title}`,
    task.description ? `Description:\n${task.description.slice(0, 6000)}` : 'Description: (none)',
    project && `Project: ${project.name}${project.description ? `: ${project.description.slice(0, 500)}` : ''}`,
    goal && `Supports goal: ${goal.title}`,
    task.checklist.length && `Current checklist:\n${task.checklist.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
