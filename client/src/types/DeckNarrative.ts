// What Claude writes for a deck when asked: a summary, short lists and speaker notes.
export default interface DeckNarrative {
  summary: string;
  highlights: string[];
  risks: string[];
  nextSteps: string[];
  notes: Record<'cover' | 'glance' | 'shipped' | 'active' | 'goals' | 'risks' | 'bounties' | 'next', string>;
}
