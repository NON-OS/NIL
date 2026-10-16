import HttpError from '../lib/HttpError.js';
import agentScope from './agentScope.js';

// A private task is encrypted for the people on it, so an agent could never read one. Rather than
// hand an agent work it can't open, refuse the assignment and say why.
export default function keepAgentsOffPrivate(task) {
  if (task.private && task.assigneeId && agentScope.isAgent(task.assigneeId)) {
    throw HttpError.badRequest('Agents can’t work on private tasks. A private task is encrypted for people, so an agent could never read it.');
  }
}
