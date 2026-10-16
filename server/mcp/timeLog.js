import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import hub from '../realtime/hub.js';
import toTimeEntry from '../mappers/toTimeEntry.js';

// The same cap the app's timer uses: an entry left running stops counting after a day.
const LONGEST = 24 * 60 * 60_000;

const running = (userId) => toTimeEntry(sql.get('SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL', userId));
const stop = (userId) => sql.run('UPDATE time_entries SET ended_at = MIN(?, started_at + ?) WHERE user_id = ? AND ended_at IS NULL', Date.now(), LONGEST, userId);
const announce = (userId) => hub.toUser(userId, { type: 'timer', timer: running(userId) });

// Starting and stopping the caller's own timer from an assistant or agent. A time log is
// personal: it's only ever the caller's own.
const timeLog = {
  running,

  start(userId, taskId, note) {
    sql.tx(() => {
      stop(userId);
      sql.run('INSERT INTO time_entries (id, user_id, task_id, note, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), userId, taskId, note, Date.now(), Date.now());
    });
    announce(userId);
    return running(userId);
  },

  stop(userId) {
    const was = running(userId);
    stop(userId);
    announce(userId);
    return was ? toTimeEntry(sql.get('SELECT * FROM time_entries WHERE id = ?', was.id)) : null;
  },
};

export default timeLog;
