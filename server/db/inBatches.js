import config from '../config.js';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Works through a large erase a batch at a time. `step(limit)` handles at most `limit` items in
// a transaction of its own and returns how many it handled; a short batch means it's done.
// Between batches the event loop gets a turn, so requests and the health check are answered
// while a big workspace is swept. Whatever was committed stays done if the server stops
// halfway, and the next run starts from what's left. Stops early, quietly, once `signal` aborts.
export default async function inBatches(step, { limit, signal } = {}) {
  let total = 0;
  for (;;) {
    if (signal?.aborted) return total;
    const done = step(limit);
    total += done;
    if (done < limit) return total;
    await pause(config.purge.pauseMs);
  }
}
