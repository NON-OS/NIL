import factChecks from './factChecks';

export type DepartureKind = 'leave' | 'removal';

// A signed word that someone is out: their own, for leaving one conversation, or an admin's, for
// leaving the team and so every conversation. It's what lets any member's browser start the next
// key without them. The place names the workspace and who is out, and for a leaving the
// conversation, so neither can be moved to another; the time is when it was signed.
const chatDeparture = {
  kinds: { leave: 'nil/chat-leave/v1', removal: 'nil/chat-removal/v1' } as const,
  place: (kind: DepartureKind, workspaceKey: string, channelId: string, userId: string) => (kind === 'leave' ? [workspaceKey, channelId, userId] : [workspaceKey, userId]),
  // what's signed as the text: nothing for a leaving, who is out for a removal
  text: (kind: DepartureKind, userId: string) => (kind === 'leave' ? '' : userId),
  list: (at: number) => [at],

  parse(list: unknown[]) {
    const [at] = list;
    if (list.length !== 1 || !factChecks.time(at)) throw new Error('This statement carries details Nil doesn’t accept.');
    return { at: at as number };
  },
};

export default chatDeparture;
