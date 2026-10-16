import type AgentRun from '../../types/AgentRun';

const STOPS: Record<string, string> = {
  max_steps: 'stopped at the step limit',
  run_tokens: 'stopped at the token limit',
  day_tokens: 'stopped at the daily token limit',
  timeout: 'stopped at the time limit',
  refusal: 'stopped: the model declined',
  max_tokens: 'stopped: the answer was cut off',
};

// A run's state in a few words, for the timeline and Settings.
export default function runStatus(run: AgentRun): string {
  switch (run.status) {
    case 'queued':
      return run.attempts ? 'waiting to retry' : 'queued';
    case 'running':
      return 'working';
    case 'done':
      return 'finished';
    case 'stopped':
      return STOPS[run.error ?? ''] ?? 'stopped early';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'cancelled';
    default:
      return run.status;
  }
}
