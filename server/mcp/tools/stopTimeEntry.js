import timeLog from '../timeLog.js';

export default {
  name: 'stop_time_entry',
  title: 'Stop the timer',
  description: 'Stop the caller’s running timer and report how long it ran.',
  write: true,
  http: { method: 'POST', path: '/time/stop' },
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run(args, { user }) {
    const entry = timeLog.stop(user.id);
    if (!entry) return { stopped: null, note: 'No timer was running.' };
    return { stopped: { note: entry.note, startedAt: new Date(entry.startedAt).toISOString(), endedAt: new Date(entry.endedAt).toISOString(), minutes: Math.round((entry.endedAt - entry.startedAt) / 60_000) } };
  },
};
