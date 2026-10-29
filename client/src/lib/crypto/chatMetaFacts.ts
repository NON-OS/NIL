import factChecks from './factChecks';

export interface ChatMetaFacts {
  at: number;
  key: string;
}

// What whoever names a conversation signs with its name and topic: when, and the hash of the
// epoch key they're sealed under. Its place is the workspace, the conversation and the epoch.
const chatMetaFacts = {
  kind: 'nil/chat-meta/v1',
  place: (workspaceKey: string, channelId: string, epoch: number) => [workspaceKey, channelId, epoch],
  list: (f: ChatMetaFacts) => [f.at, f.key],

  parse(list: unknown[]): ChatMetaFacts {
    const [at, key] = list;
    if (list.length !== 2 || !factChecks.time(at) || !factChecks.hash(key)) throw new Error('This name carries details Nil doesn’t accept.');
    return { at, key } as ChatMetaFacts;
  },
};

export default chatMetaFacts;
