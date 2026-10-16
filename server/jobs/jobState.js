// When each background job last succeeded and last failed, for /healthz, and the runs still in
// progress, which a shutdown waits for. Only times are kept, never what a job was working on.
const jobs = new Map();
const running = new Set();

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

const jobState = {
  register(name) {
    if (!jobs.has(name)) jobs.set(name, { lastSuccess: 0, lastFailure: 0 });
  },

  succeeded(name) {
    jobs.get(name).lastSuccess = Date.now();
  },

  failed(name) {
    jobs.get(name).lastFailure = Date.now();
  },

  track(run) {
    running.add(run);
    run.finally(() => running.delete(run));
  },

  // runs never reject (safeJob catches everything), so this waits for all of them
  idle: () => Promise.all([...running]),

  report() {
    const out = {};
    for (const [name, { lastSuccess, lastFailure }] of jobs) out[name] = { lastSuccess: iso(lastSuccess), lastFailure: iso(lastFailure) };
    return out;
  },
};

export default jobState;
