import type { MentionOptions } from '@tiptap/extension-mention';
import store from '../../../state/store';
import fuzzyScore from '../../../lib/fuzzyScore';
import suggestionPopup from './suggestionPopup';

// @ lists teammates who can read docs: people, not agents, still active.
const mentionSuggestion: Partial<MentionOptions['suggestion']> = {
  items: ({ query }) => {
    const people = Object.values(store.get().users).filter((u) => !u.deactivated && u.kind !== 'agent');
    const scored = query ? people.map((u) => ({ u, s: fuzzyScore(u.name, query) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.u) : people;
    return scored.slice(0, 8).map((u) => ({ id: u.id, label: u.name }));
  },
  render: suggestionPopup('People', 'Nobody by that name') as any,
};

export default mentionSuggestion;
