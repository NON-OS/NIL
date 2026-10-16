import http from '../api/http';
import store from '../state/store';
import archive from './archive';
import deckFacts from '../lib/deck/deckFacts';
import type DeckScope from '../types/DeckScope';
import type DeckNarrative from '../types/DeckNarrative';

const DAY = 86_400_000;

const decks = {
  open: (preset?: Partial<DeckScope>) => store.set({ deck: { open: true, preset } }),
  close: () => store.set({ deck: { open: false } }),

  // Facts are gathered here from what you can see; with AI on, only those facts go to Claude.
  // The deck covers the whole period and every bounty, so older finished tasks are loaded from
  // the archive first. The deck builder is loaded only when someone makes a deck.
  async create(scope: DeckScope, withAi: boolean) {
    await archive.since(Date.now() - scope.days * DAY);
    if (store.get().nox) await archive.bounties();
    const facts = deckFacts(store.get(), scope);
    const story = withAi ? (await http.post<{ narrative: DeckNarrative }>('/ai/deck', { facts })).narrative : null;
    const { default: buildDeck } = await import('../lib/deck/buildDeck');
    await buildDeck(facts, story);
    return facts;
  },
};

export default decks;
