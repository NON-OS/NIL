import type AgentOptions from '../types/AgentOptions';
import type AgentRunner from '../types/AgentRunner';

// Only what can work here is offered: the workspace's AI once it has a provider, and on a server
// with no route out, external agents and Claude on the server's own key.
export default function canRunAgent(runner: AgentRunner, options: AgentOptions) {
  if (runner === 'external') return true;
  if (runner === 'workspace') return Boolean(options.workspaceProvider);
  return options.outbound || (runner === 'anthropic' && options.anthropicAvailable);
}
