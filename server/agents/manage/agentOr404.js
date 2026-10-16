import HttpError from '../../lib/HttpError.js';
import loadAgent from '../loadAgent.js';

// The agent an admin route names, or a 404 when it doesn't exist or was deleted.
export default function agentOr404(id) {
  const agent = loadAgent(id);
  if (!agent || agent.removedAt) throw HttpError.notFound('That agent');
  return agent;
}
