type Line = { key: string; title: string; who: string | null; due?: string | null };

// Everything a status deck says, gathered from tasks you can see. Nothing here leaves the
// browser unless you ask the AI to write the narrative.
export default interface DeckFacts {
  title: string;
  subtitle: string;
  period: { from: string; to: string; days: number };
  counts: { shipped: number; active: number; open: number; overdue: number };
  shipped: Line[];
  active: Line[];
  risks: Line[];
  nextUp: Line[];
  goals: { title: string; pct: number }[];
  people: { name: string; shipped: number }[];
  // per person and token, already written as "250 NOX"
  bounties: { paid: string; owed: string; rows: { name: string; token: string; paid: string; owed: string }[] } | null;
}
