import { EventEmitter } from 'node:events';

// Lets the code that queues agent work wake the workers without importing them, which would
// tie the task services to the runner in a loop: 'run' when a run is queued, 'delivery' when a
// webhook delivery is, and 'stop' (with a task id and a reason) when runs on a task must end.
const signals = new EventEmitter();

export default signals;
