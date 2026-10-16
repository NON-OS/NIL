import worker from '../agents/runner/worker.js';

// Runs every few seconds: starts queued built-in agent runs up to the concurrency limit. Runs
// queued meanwhile start at once too; the timer catches retries whose wait is over.
export default function runAgentQueue() {
  worker.tick();
}
