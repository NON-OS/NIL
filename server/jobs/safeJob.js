import logLimited from '../lib/logLimited.js';
import jobState from './jobState.js';

// Wraps a background job so a failure is logged instead of taking the server down. A job that
// throws, returns a rejected promise, hits "database is locked" or a full disk ends up here, and
// the next run goes ahead as planned. A run that is still going when the next one is due is
// skipped, so a slow Ethereum node can't pile up overlapping runs.
//
// Every call returns a promise that resolves once the run is over and never rejects. `signal`
// is handed to the job, which can check it between items to stop early on shutdown.
export default function safeJob(name, job, { signal } = {}) {
  jobState.register(name);
  let current = null;

  const failed = (err) => {
    jobState.failed(name);
    logLimited(`job:${name}`, 'error', 'jobs', `The ${name} job failed.`, err);
  };

  return function run() {
    if (current) return current;
    let result;
    try {
      result = job(signal);
    } catch (err) {
      failed(err);
      return Promise.resolve();
    }
    if (typeof result?.then !== 'function') {
      jobState.succeeded(name);
      return Promise.resolve();
    }
    current = Promise.resolve(result)
      .then(() => jobState.succeeded(name))
      .catch(failed)
      .finally(() => {
        current = null;
      });
    jobState.track(current);
    return current;
  };
}
