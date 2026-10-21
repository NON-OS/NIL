import type AgentOptions from '../types/AgentOptions';
import type AgentRunner from '../types/AgentRunner';

// The model a built-in agent runs on when its own field is left empty, as the server picks it:
// the workspace's model, or on Anthropic the workspace's Claude model and then AGENT_MODEL.
export default function agentDefaultModel(runner: AgentRunner, options: AgentOptions) {
  const workspace = options.workspaceProvider;
  if (runner === 'workspace') return workspace?.model ?? null;
  if (runner === 'anthropic') return (workspace?.source === 'workspace' && workspace.kind === 'anthropic' ? workspace.model : null) ?? options.defaults.model;
  return null;
}
