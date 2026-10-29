import './GettingStarted.css';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';
import ProjectModal from '../overlays/ProjectModal';
import useStore from '../../state/useStore';
import firstRun from '../../actions/firstRun';
import ui from '../../actions/ui';
import router from '../../lib/router';
import cx from '../../lib/cx';

// The short checklist on My work for whoever set up the workspace. Each step ticks itself
// when it happens, wherever it happens; the card goes away once everything is done, once it's
// dismissed, or once the team is plainly using the workspace already. A sample project can be
// added from here while there's nothing real to look at, and taken away again in one click.
const IN_USE = 25;

export default function GettingStarted() {
  const state = useStore((s) => s.firstRun);
  const meId = useStore((s) => s.me?.id);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const people = useStore((s) => Object.keys(s.users).length);
  const [newProject, setNewProject] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void firstRun.load();
  }, []);

  const sampleId = state?.sample?.projectId;
  const real = useMemo(() => Object.values(tasks).filter((t) => t.projectId !== sampleId), [tasks, sampleId]);
  const hasProject = Object.values(projects).some((p) => p.id !== sampleId);
  const steps = useMemo(
    () => [
      {
        title: 'Create a project',
        detail: 'Group the tasks for one goal, like a launch or a hiring round.',
        done: hasProject,
        run: () => setNewProject(true),
      },
      {
        title: 'Invite people',
        detail: 'Send a link. Teammates join with their own wallet.',
        done: Boolean(state?.invited) || people > 1,
        run: () => router.navigate('/settings?tab=team'),
      },
      {
        title: 'Add a task with quick add',
        detail: 'Press C anywhere and type naturally, like “Call the venue friday !high”.',
        done: Boolean(state?.quickAdd) || real.filter((t) => t.creatorId === meId).length >= 3,
        run: () => ui.quickAdd(),
      },
      {
        title: 'Try a private task',
        detail: 'Only you and the person you assign can read it. It’s encrypted before it leaves your browser.',
        done: Object.values(tasks).some((t) => t.private && t.creatorId === meId),
        run: () => ui.quickAdd({ private: true }),
      },
    ],
    [hasProject, real, tasks, people, meId, state?.invited, state?.quickAdd],
  );

  const sample = async (add: boolean) => {
    setBusy(true);
    await (add ? firstRun.addSample() : firstRun.removeSample());
    setBusy(false);
  };

  if (!state) return null;
  const left = steps.filter((s) => !s.done).length;

  const sampleControls = sampleId ? (
    <>
      <span>The sample project is here to click through.</span>
      <a href={`/projects/${sampleId}`} onClick={router.link(`/projects/${sampleId}`)}>
        Open it
      </a>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => sample(false)}>
        Remove sample project
      </button>
    </>
  ) : hasProject ? null : (
    <>
      <span>Want to look around first? A sample project has a website launch, an offsite and a hiring round.</span>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => sample(true)}>
        Add a sample project
      </button>
    </>
  );

  // dismissed, everything done or a team already at work: only a sample project still needs a way out
  if (!state.active || (!left && !sampleId) || real.length >= IN_USE) {
    return sampleId ? <div className="getting-started-bar">{sampleControls}</div> : null;
  }

  return (
    <section className="panel getting-started" aria-labelledby="getting-started-title">
      <div className="panel-head">
        <h2 id="getting-started-title">{left ? 'Get started' : 'You’re all set'}</h2>
        <span className="muted num">
          {steps.length - left} of {steps.length} done
        </span>
        <button type="button" className="icon-btn" onClick={() => firstRun.dismiss()} aria-label="Dismiss getting started" title="Dismiss">
          <X />
        </button>
      </div>
      <ol className="getting-started-steps">
        {steps.map((step) => (
          <li key={step.title} className={cx(step.done && 'done')}>
            {step.done ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
            <div>
              <button type="button" className="getting-started-step" onClick={step.run}>
                {step.title}
                {step.done && <span className="sr-only"> (done)</span>}
              </button>
              <small>{step.detail}</small>
            </div>
          </li>
        ))}
      </ol>
      {sampleControls && <div className="getting-started-sample">{sampleControls}</div>}
      {newProject && <ProjectModal onClose={() => setNewProject(false)} />}
    </section>
  );
}
