import ask from './ask.js';

const text = { type: 'string' };
const list = { type: 'array', items: text };
const NOTES = ['cover', 'glance', 'shipped', 'active', 'goals', 'risks', 'bounties', 'next'];

const SCHEMA = {
  type: 'object',
  properties: {
    summary: text,
    highlights: list,
    risks: list,
    nextSteps: list,
    notes: { type: 'object', properties: Object.fromEntries(NOTES.map((k) => [k, text])), required: NOTES, additionalProperties: false },
  },
  required: ['summary', 'highlights', 'risks', 'nextSteps', 'notes'],
  additionalProperties: false,
};

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

// Writes the words for a status deck from facts the browser gathered. The slides themselves
// are built in the browser; this only returns text, checked against the facts it was given.
export default async function deckNarrative(facts) {
  const out = await ask({
    schema: SCHEMA,
    effort: 'medium',
    prompt: `Write the narrative for a status presentation from the facts below. House style: plain, factual, verifiable. Numbers over adjectives. No hype, no exclamation marks. State what is unfinished.
- summary: two or three sentences a manager could read aloud
- highlights: up to 4 short lines about what shipped, each naming real tasks
- risks: up to 3 short lines about what could slip and why, from the overdue and urgent items
- nextSteps: up to 6 short imperative lines, from the in-progress and next-up work
- notes: speaker notes for each slide, 2 to 4 sentences, using only these facts

<facts>
${JSON.stringify(facts)}
</facts>`,
  });
  return {
    summary: clean(out?.summary, 800),
    highlights: (out?.highlights ?? []).slice(0, 4).map((l) => clean(l, 200)),
    risks: (out?.risks ?? []).slice(0, 3).map((l) => clean(l, 200)),
    nextSteps: (out?.nextSteps ?? []).slice(0, 6).map((l) => clean(l, 200)),
    notes: Object.fromEntries(NOTES.map((k) => [k, clean(out?.notes?.[k], 1200)])),
  };
}
