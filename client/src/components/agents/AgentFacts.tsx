import useStore from '../../state/useStore';
import meta from '../../lib/meta';
import type Agent from '../../types/Agent';
import countOf from '../../lib/countOf';

const RUNNER = { external: 'External, over MCP or the REST API', anthropic: 'Built in, on Anthropic', openai: 'Built in, on an OpenAI-compatible endpoint' };

// What an agent may reach and how it's set up, in one list.
export default function AgentFacts({ agent }: { agent: Agent }) {
  const projects = useStore((s) => s.projects);
  const scope = agent.allProjects ? 'All projects' : agent.projectIds.map((id) => projects[id]?.name).filter(Boolean).join(', ') || 'No projects yet: only tasks assigned to it';
  const builtIn = agent.runner !== 'external';
  return (
    <dl className="agent-facts">
      <dt>Access</dt>
      <dd>{agent.access === 'write' ? 'Read and write' : 'Read only'}</dd>
      <dt>Projects</dt>
      <dd>{scope}</dd>
      <dt>Runs</dt>
      <dd>
        {RUNNER[agent.runner]}
        {builtIn && agent.model && <> · <code>{agent.model}</code></>}
        {agent.endpointHost && <> · {agent.endpointHost}</>}
      </dd>
      {agent.tools && (
        <>
          <dt>Tools</dt>
          <dd>{agent.tools.length ? agent.tools.join(', ') : 'None'}</dd>
        </>
      )}
      {builtIn && agent.limits && (
        <>
          <dt>When done</dt>
          <dd>{agent.doneStatus === 'none' ? 'Leaves the status' : `Moves assigned work to ${meta.status[agent.doneStatus ?? 'in_review']}`}</dd>
          <dt>Limits</dt>
          <dd>
            {countOf(agent.limits.maxSteps, 'step')} and {countOf(agent.limits.maxRunTokens, 'token')} per run, {countOf(agent.limits.maxDayTokens, 'token')} a day
          </dd>
          {agent.price && (
            <>
              <dt>Prices</dt>
              <dd>
                ${agent.price.in} in, ${agent.price.out} out, per million tokens
              </dd>
            </>
          )}
        </>
      )}
      {!builtIn && agent.limits && (
        <>
          <dt>Rate limit</dt>
          <dd>{countOf(agent.limits.rateLimit, 'request')} a minute</dd>
        </>
      )}
      {agent.instructions && (
        <>
          <dt>Instructions</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{agent.instructions}</dd>
        </>
      )}
    </dl>
  );
}
