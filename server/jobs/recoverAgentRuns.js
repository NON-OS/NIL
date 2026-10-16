import worker from '../agents/runner/worker.js';

// Runs once at startup: agent runs the last process left half-done go back in the queue.
export default function recoverAgentRuns() {
  worker.recover();
}
