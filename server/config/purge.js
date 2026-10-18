import envNumber from '../lib/envNumber.js';

// How the retention sweeps erase: a few tasks or a few hundred rows per transaction, with a pause
// between batches, so requests and health checks are answered while a large workspace is swept.
// A task takes its comments, files and history with it, so it counts as more work than a row.
export default Object.freeze({
  batchRows: envNumber('PURGE_BATCH_ROWS', 500, { min: 1 }),
  batchTasks: envNumber('PURGE_BATCH_TASKS', 25, { min: 1 }),
  pauseMs: envNumber('PURGE_BATCH_PAUSE_MS', 10, { max: 10_000 }),
});
