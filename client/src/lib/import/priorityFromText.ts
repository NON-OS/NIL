import type Priority from '../../types/Priority';

// Priority words from spreadsheets and other trackers. Bare numbers mean different things in
// different apps, so they're left as no priority rather than guessed.
const RULES: [RegExp, Priority][] = [
  [/\b(urgent|highest|critical|blocker|asap|p1)\b/i, 4],
  [/\b(high|important|p2)\b/i, 3],
  [/\b(medium|normal|moderate|p3)\b/i, 2],
  [/\b(low|lowest|minor|p4)\b/i, 1],
];

export default function priorityFromText(text: string | null | undefined): Priority {
  const value = (text ?? '').trim();
  return RULES.find(([pattern]) => pattern.test(value))?.[1] ?? 0;
}
