import type Status from '../../types/Status';

// Column, list or status names other apps use, read as one of Nil's statuses. Order matters:
// "Not done" and "Not started" are still to do, and a "Done" column holding yes or no works.
const RULES: [RegExp, Status][] = [
  [/\bnot\b|^(no|false|0)$/i, 'todo'],
  [/\b(done|complete|completed|finished|closed|shipped|resolved|yes|true|x)\b|✓|✔/i, 'done'],
  [/\b(cancell?ed|won'?t do|dropped|abandoned)\b/i, 'canceled'],
  [/\b(review|reviewing|qa|testing|approval)\b/i, 'in_review'],
  [/\b(doing|in progress|progress|working|started|active|ongoing)\b/i, 'in_progress'],
  [/\b(backlog|someday|ideas?|later|icebox|parked)\b/i, 'backlog'],
];

export default function statusFromText(text: string | null | undefined): Status {
  const value = (text ?? '').trim();
  return RULES.find(([pattern]) => pattern.test(value))?.[1] ?? 'todo';
}
