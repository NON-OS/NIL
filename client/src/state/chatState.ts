import type ChatChannel from '../types/ChatChannel';
import type ChatItem from '../types/ChatItem';
import type ChatNotice from '../types/ChatNotice';
import type { Scopes } from '../lib/crypto/chatMarkFacts';

export interface Timeline {
  // top-level messages and reactions in server order, then any still waiting to be sent
  items: ChatItem[];
  // whether older pages are still on the server, and whether one is loading
  more: boolean;
  loading: boolean;
  error: string | null;
  // whether the server's newest page has been loaded, beyond what this tab is sending
  fetched: boolean;
}

export interface ChatState {
  channels: Record<string, ChatChannel>;
  // null until the list first loads; an error message when it couldn't
  loaded: boolean;
  error: string | null;
  // a channel's main timeline, or a thread's, keyed by channel id or `thread:<root id>`
  timelines: Record<string, Timeline>;
  // channel id -> 'main' or a thread's id -> user id -> when their typing hint runs out
  typing: Record<string, Record<string, Record<string, number>>>;
  notices: Record<string, ChatNotice[]>;
  // channel id -> sending tab's stream -> its checked high-water mark
  marks: Record<string, Record<string, { senderId: string; scopes: Scopes; edits: Record<string, number> }>>;
  // the conversation on screen, so live messages there count as read
  viewing: string | null;
}

const initial: ChatState = { channels: {}, loaded: false, error: null, timelines: {}, typing: {}, notices: {}, marks: {}, viewing: null };
let state = initial;
const listeners = new Set<() => void>();

// Chat lives in a store of its own, next to the app's: what's on screen of each conversation,
// opened in this tab. Like opened docs, it's in memory only and goes when the keys lock.
const chatState = {
  get: () => state,

  set(patch: Partial<ChatState> | ((current: ChatState) => Partial<ChatState>)) {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    listeners.forEach((listener) => listener());
  },

  timeline: (key: string): Timeline => state.timelines[key] ?? { items: [], more: true, loading: false, error: null, fetched: false },

  putTimeline(key: string, patch: Partial<Timeline>) {
    chatState.set((s) => ({ timelines: { ...s.timelines, [key]: { ...chatState.timeline(key), ...patch } } }));
  },

  reset() {
    state = initial;
    listeners.forEach((listener) => listener());
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export default chatState;
