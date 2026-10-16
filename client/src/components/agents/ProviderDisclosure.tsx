import { EyeOff } from 'lucide-react';
import type AgentRunner from '../../types/AgentRunner';

const LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|[^.]+\.local\b|[^.:]+(:\d+)?$)/;

function text(runner: AgentRunner | null, host: string | null) {
  const nothingPrivate = 'Nothing from private tasks or docs: they are encrypted in people’s browsers, and no agent, model or server can read them.';
  switch (runner) {
    case 'anthropic':
      return `When this agent works, the team task text it reads (titles, descriptions, checklists and comments in its projects) is sent to Anthropic to run the model. ${nothingPrivate}`;
    case 'openai':
      return host && LOCAL.test(host)
        ? `This agent uses the model at ${host}. With a model on your own server or network, the task text it reads stays there. ${nothingPrivate}`
        : `When this agent works, the team task text it reads is sent to ${host ?? 'the model endpoint'} to run the model. ${nothingPrivate}`;
    case 'external':
      return `This agent runs outside Nil. What its key reads (team tasks in its projects, their comments and checklists) goes to wherever it runs and to the model provider it uses. Webhooks carry only ids and keys. ${nothingPrivate}`;
    default:
      return `Agents see team tasks in their projects. An agent backed by Anthropic sends the task text it works on to Anthropic; one backed by a local model keeps it all on your own server; an external agent sends it wherever it runs. ${nothingPrivate}`;
  }
}

// Says plainly what an agent's model provider gets to see, before anyone relies on the agent.
export default function ProviderDisclosure({ runner = null, host = null }: { runner?: AgentRunner | null; host?: string | null }) {
  return (
    <div className="agent-disclosure">
      <EyeOff />
      <p>{text(runner, host)}</p>
    </div>
  );
}
