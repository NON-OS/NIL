import b64u from '../../lib/crypto/b64u';

// This tab's own stream of messages: a random name, and the next number in each conversation
// and thread. A new tab starts a new stream, so two tabs never number the same way, and nothing
// needs to be kept across reloads.
const stream = b64u.encode(crypto.getRandomValues(new Uint8Array(12)));
const next = new Map<string, number>();
const scope = (channelId: string, threadId: string | null) => `${channelId}/${threadId ?? 'main'}`;

const chatCounters = {
  stream,
  peek: (channelId: string, threadId: string | null) => next.get(scope(channelId, threadId)) ?? 1,
  // a number counts as used once the server may have kept the message
  used(channelId: string, threadId: string | null, n: number) {
    const key = scope(channelId, threadId);
    next.set(key, Math.max(next.get(key) ?? 1, n + 1));
  },
};

export default chatCounters;
