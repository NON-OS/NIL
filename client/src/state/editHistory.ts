import storage from '../lib/storage';
import keyScope from './keyScope';

const KEEP = 5000;
const DELETED = -1;
const slot = () => keyScope.slot('chat-edits');

// The newest edit of each chat message this browser has opened and checked, and the ones it saw
// deleted, per workspace and account: message ids and numbers only. A server that later serves an
// older edit, or brings a deleted message back, in this tab or another, is caught.
const editHistory = {
  // true when this edit is older than one seen, or the message was seen deleted and this isn't
  stale(messageId: string, edit: number, deleted: boolean) {
    const here = slot();
    const seen = here ? storage.get<Record<string, number>>(here, {})[messageId] : undefined;
    if (seen === undefined) return false;
    return seen === DELETED ? !deleted : edit < seen;
  },

  record(messageId: string, edit: number, deleted: boolean) {
    const here = slot();
    if (!here) return;
    const all = storage.get<Record<string, number>>(here, {});
    const next = deleted ? DELETED : edit;
    if (all[messageId] === DELETED || (all[messageId] ?? -2) >= next) return;
    const entries = Object.entries({ ...all, [messageId]: next });
    storage.set(here, Object.fromEntries(entries.slice(-KEEP)));
  },
};

export default editHistory;
