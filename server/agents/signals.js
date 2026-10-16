import { EventEmitter } from 'node:events';

// Lets the code that queues agent work wake the workers without importing them, which would
// tie the task services to the runner in a loop: 'run' when a run is queued, 'delivery' when a
// webhook delivery is.
const signals = new EventEmitter();

export default signals;
