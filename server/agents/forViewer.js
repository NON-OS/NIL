import guestScope from '../services/guestScope.js';
import approvers from './approvers.js';

// A run log quotes what the agent read through its tools, which can include tasks in projects a
// guest can't see, and an approval card can describe work elsewhere. Guests see how runs went
// without the log, and an approval's details only when they're the one asked to decide it.
const forViewer = {
  run(run, viewer) {
    if (!run.steps || !guestScope.of(viewer.id)) return run;
    return { ...run, steps: [], stepsHidden: true };
  },

  approval(approval, viewer, task) {
    if (!guestScope.of(viewer.id) || approvers(task).has(viewer.id)) return approval;
    return { ...approval, input: {}, summary: 'A change an agent asked for', result: null };
  },
};

export default forViewer;
