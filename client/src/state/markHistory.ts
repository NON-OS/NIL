import storage from '../lib/storage';
import keyScope from './keyScope';
import type { Scopes } from '../lib/crypto/chatMarkFacts';

const KEEP = 2000;
const slot = () => keyScope.slot('chat-marks');
type Seen = Record<string, { at: number; scopes: Scopes }>;

// The newest mark this browser has checked for each sender's stream in each conversation, per
// workspace and account: how far they had numbered, and when they said so. A mark the server
// serves later can only move it forward.
const markHistory = {
  newest(channelId: string, name: string, at: number, scopes: Scopes): Scopes {
    const here = slot();
    if (!here) return scopes;
    const seen = storage.get<Seen>(here, {});
    const key = `${channelId}/${name}`;
    const held = seen[key];
    if (held && held.at >= at) return held.scopes;
    const all = Object.entries({ ...seen, [key]: { at, scopes } });
    storage.set(here, Object.fromEntries(all.sort((a, b) => b[1].at - a[1].at).slice(0, KEEP)));
    return scopes;
  },
};

export default markHistory;
