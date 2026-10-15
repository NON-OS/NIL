import http from '../api/http';
import store from '../state/store';
import deckFacts from '../lib/deck/deckFacts';
import buildDeck from '../lib/deck/buildDeck';
import type DeckScope from '../types/DeckScope';
import type DeckNarrative from '../types/DeckNarrative';

const decks = {
  open: (preset?: Partial<DeckScope>) => store.set({ deck: { open: true, preset } }),
  close: () => store.set({ deck: { open: false } }),

  // Facts are gathered here from what you can see; with AI on, only those facts go to Claude.
  async create(scope: DeckScope, withAi: boolean) {
    const facts = deckFacts(store.get(), scope);
    const story = withAi ? (await http.post<{ narrative: DeckNarrative }>('/ai/deck', { facts })).narrative : null;
    await buildDeck(facts, story);
    return facts;
  },
};

export default decks;
