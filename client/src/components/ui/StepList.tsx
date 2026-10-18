import cx from '../../lib/cx';

interface Step {
  title: string;
  detail: string;
}

// Numbered steps in the brand's 01, 02, 03 style, with the current one marked. `current` counts
// from 1; 0 marks none.
export default function StepList({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <ol className="step-list">
      {steps.map((step, i) => (
        <li key={step.title} className={cx(i + 1 === current && 'now', i + 1 < current && 'done')} aria-current={i + 1 === current ? 'step' : undefined}>
          <b aria-hidden="true">{String(i + 1).padStart(2, '0')}</b>
          <span>
            <strong>{step.title}</strong>
            <small>{step.detail}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}
