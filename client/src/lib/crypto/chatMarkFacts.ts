import factChecks from './factChecks';

export interface Scopes {
  // per timeline ('main', or a thread's first message id): the highest number the tab sent there,
  // and when that message disappears, if it does
  [scope: string]: { n: number; until: number | null };
}

const ID = /^([A-Za-z0-9_-]{22}|main)$/;
const MAX_EDITS = 100;

// A tab's high-water mark in a conversation: how far it has numbered what it sent in each
// timeline, signed by its sender and sealed under the epoch's key. A reader who sees a mark ahead
// of the messages the server delivered knows the server held the last ones back.
const chatMarkFacts = {
  kind: 'nil/chat-mark/v1',
  list: (at: number, key: string) => [at, key],
  parse(list: unknown[]) {
    const [at, key] = list;
    if (list.length !== 2 || !factChecks.time(at) || !factChecks.hash(key)) throw new Error('This mark carries details Nil doesn’t accept.');
    return { at: at as number, key: key as string };
  },
  scopes(text: string): Scopes {
    const value = JSON.parse(text);
    const out: Scopes = {};
    if (!value || typeof value !== 'object') return out;
    for (const [scope, v] of Object.entries(value).slice(0, 200)) {
      const { n, until } = (v ?? {}) as { n?: unknown; until?: unknown };
      if (ID.test(scope) && factChecks.count(n, 2 ** 31) && (until === null || factChecks.time(until))) out[scope] = { n: n as number, until: until as number | null };
    }
    return out;
  },

  // The newest edit of each message the tab changed lately, under `edits`, -1 for one it deleted.
  // A reader holds only that sender's own messages to it.
  edits(text: string): Record<string, number> {
    const value = JSON.parse(text)?.edits;
    const out: Record<string, number> = {};
    if (!value || typeof value !== 'object') return out;
    for (const [id, n] of Object.entries(value).slice(0, MAX_EDITS)) if (/^[A-Za-z0-9_-]{22}$/.test(id) && Number.isSafeInteger(n) && (n as number) >= -1 && (n as number) < 2 ** 31) out[id] = n as number;
    return out;
  },
  maxEdits: MAX_EDITS,
};

export default chatMarkFacts;
