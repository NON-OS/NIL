import { useState } from 'react';
import cx from '../../lib/cx';
import type AgentStep from '../../types/AgentStep';

const LABEL: Record<AgentStep['kind'], string> = {
  brief: 'Briefing',
  model: 'Model',
  tool: 'Tool',
  refused: 'Refused',
  approval: 'Needs approval',
  guard: 'Caution',
  note: 'Note',
  error: 'Error',
};

const show = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));

// One line of a run log. Long text (the briefing, a tool's answer) opens on click.
export default function StepLine({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(false);
  const detail = [step.input !== null && step.kind !== 'model' ? show(step.input) : null, step.output].filter(Boolean).join('\n\n→ ');
  return (
    <li className={cx('agent-step', !step.ok && 'agent-step-bad')}>
      <button type="button" className="agent-step-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="agent-step-kind">{LABEL[step.kind] ?? step.kind}</span>
        {step.tool && <code>{step.tool}</code>}
        <span className="agent-step-text">{step.kind === 'model' ? step.output : step.kind === 'brief' ? 'What the agent was given' : (step.output ?? '').split('\n')[0]}</span>
      </button>
      {open && detail && <pre className="agent-step-detail">{detail}</pre>}
    </li>
  );
}
