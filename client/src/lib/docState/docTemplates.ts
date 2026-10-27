export interface DocTemplate {
  id: string;
  label: string;
  title: string;
  markdown: string;
}

// Starting points for the docs teams write most. Each is a few headings and prompts to replace.
const docTemplates: DocTemplate[] = [
  {
    id: 'meeting',
    label: 'Meeting notes',
    title: 'Meeting notes',
    markdown: '## Who was there\n\n- Name\n\n## Agenda\n\n1. Topic\n\n## Notes\n\nWhat was said that matters later.\n\n## Decisions\n\n- What was decided, and by whom\n\n## Action items\n\n- [ ] Who does what, by when\n',
  },
  {
    id: 'brief',
    label: 'Project brief',
    title: 'Project brief',
    markdown: '## Problem\n\nWhat hurts today, and for whom.\n\n## Goal\n\nWhat changes when this is done, and how we will know.\n\n## Not doing\n\n- What this project leaves out on purpose\n\n## Plan\n\n| Milestone | Owner | Date |\n| --- | --- | --- |\n| First step | Name | Date |\n\n## Risks\n\n- What could go wrong, and what we do if it does\n\n## Open questions\n\n- [ ] Question, and who answers it\n',
  },
  {
    id: 'runbook',
    label: 'Runbook',
    title: 'Runbook',
    markdown: '## When to use this\n\nThe alert, symptom or request that brings someone here.\n\n## Before you start\n\n- Access you need\n- What to tell the team\n\n## Steps\n\n1. First step\n2. Next step\n\n## Check it worked\n\nWhat you should see afterwards.\n\n## Roll back\n\n1. How to undo it\n\n## Who to call\n\n- Name, and when to call them\n',
  },
  {
    id: 'decision',
    label: 'Decision record',
    title: 'Decision',
    markdown: '## Context\n\nWhat we need to decide, and why now.\n\n## Options\n\n| Option | For | Against |\n| --- | --- | --- |\n| Option one | Why it helps | What it costs |\n\n## Decision\n\nWhat we chose, who decided and when.\n\n## What follows\n\n- What changes because of it\n',
  },
];

export default docTemplates;
