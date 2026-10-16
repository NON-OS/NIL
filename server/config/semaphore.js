import envNumber from '../lib/envNumber.js';

// Anonymous votes (Semaphore). Every proof uses one circuit depth, so one set of circuit files
// serves every group size up to 2^depth voters; `npm run zk:fetch` downloads the matching files.
export default Object.freeze({
  depth: envNumber('SEMAPHORE_DEPTH', 16, { min: 1, max: 32 }),
});
