import config from '../../config.js';
import redactSecrets from './redactSecrets.js';

const MAX = 9000;

function stopNote(stop, agent) {
  switch (stop) {
    case 'max_steps':
      return `Stopped at the step limit (${agent.limits.maxSteps}) before finishing.`;
    case 'run_tokens':
      return 'Stopped at the token limit for one run before finishing.';
    case 'day_tokens':
      return 'Stopped because this agent has used its tokens for today.';
    case 'timeout':
      return `Stopped at the time limit (${Math.round(config.agents.runTimeoutMs / 60_000) || 1} min) before finishing.`;
    case 'refusal':
      return 'The model declined to continue with this task.';
    case 'max_tokens':
      return 'The model’s answer hit its length limit and was cut off.';
    default:
      return null;
  }
}

// The comment a run leaves on its task: the model's own summary, scrubbed of anything shaped like
// a secret, then a plain footer with what the server knows for certain: how many changes went
// through, what waits for approval, and why the run stopped if it stopped early.
export default function runComment({ text, stop, changes, pending, agent, secrets = [] }) {
  const body = redactSecrets(text, secrets).trim().slice(0, MAX);
  const facts = [
    changes ? `${changes} change${changes === 1 ? '' : 's'} made` : 'No changes made',
    ...pending.map((p) => `waiting for approval: ${p.summary} (${p.reasons.join(', ')})`),
    stopNote(stop, agent),
  ].filter(Boolean);
  const opening = body || (changes ? 'I made the changes noted below.' : 'I looked at this task but didn’t change anything.');
  return `${opening}\n\n_${facts.join(' · ')}_`;
}
