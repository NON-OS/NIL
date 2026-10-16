import findTaskByKey from '../../services/findTaskByKey.js';
import timeLog from '../timeLog.js';

const minutesSince = (ts) => Math.round((Date.now() - ts) / 60_000);

export default {
  name: 'start_time_entry',
  title: 'Start a timer',
  description: 'Start the caller’s own timer, optionally on a task. Whatever was running stops first, so there is only ever one.',
  write: true,
  http: { method: 'POST', path: '/time/start' },
  inputSchema: {
    type: 'object',
    properties: { key: { type: 'string', description: 'Task key, like NON-12' }, note: { type: 'string', maxLength: 300 } },
    additionalProperties: false,
  },
  run(args, { user }) {
    const task = args.key ? findTaskByKey(args.key, user) : null;
    const entry = timeLog.start(user.id, task?.id ?? null, (args.note ?? '').trim());
    return { running: { task: args.key ?? null, note: entry.note, startedAt: new Date(entry.startedAt).toISOString(), minutes: minutesSince(entry.startedAt) } };
  },
};
