import db from '../db/connection.js';
import log from './log.js';

// Stops the server in an order that loses nothing: no new job runs, open tabs told to reconnect
// (1001), requests already in progress allowed to finish, running jobs awaited, and the database
// closed last so its write-ahead log is checkpointed into the main file. If that takes longer
// than `timeoutMs` the process exits with an error code, so the supervisor knows it wasn't clean.
export default function gracefulShutdown({ server, realtime, jobs, timeoutMs }) {
  let started = false;

  return async function shutdown(reason, code = 0) {
    if (started) return;
    started = true;
    log.info('server', `Shutting down (${reason}).`);
    // kept referenced on purpose: should a step hang with nothing else left to run, the process
    // must still end with an error, not drift into a quiet exit 0
    setTimeout(() => {
      log.error('server', `Shutdown didn’t finish within ${timeoutMs / 1000} s. Exiting anyway.`);
      process.exit(1);
    }, timeoutMs);

    try {
      jobs.stop();
      // stop accepting connections first; the callback fires once the last one has closed
      const drained = new Promise((resolve) => server.close(resolve));
      server.closeIdleConnections();
      await realtime.close();
      await drained;
      await jobs.idle();
      db.close();
      log.info('server', 'Stopped.');
      process.exit(code);
    } catch (err) {
      log.error('server', 'Shutdown failed.', err);
      process.exit(1);
    }
  };
}
