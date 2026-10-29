import store from '../../state/store';
import isAdmin from '../../lib/isAdmin';
import rosterLead from '../../lib/rosterLead';
import keyDirectory from '../keyDirectory';
import departures from './departures';
import type ChatRoster from '../../types/ChatRoster';

// When someone joined for the last time: the time of the earliest list in the unbroken run of
// lists, up to the newest in `history`, that names them. A departure signed before that is from
// an earlier stay.
function joinedAt(history: ChatRoster[], userId: string) {
  let at = 0;
  for (let i = history.length - 1; i >= 0 && history[i].members.includes(userId); i--) at = history[i].at;
  return at;
}

// Whether one of `proofs` is a signed departure of `userId` that counts after the newest list in
// `history`: their own leaving of the conversation, or a removal from the team signed by someone
// who manages it (rosterLead), signed since they last joined. Nothing in it depends on anyone's
// role now, so a list that counted once counts for good, in every browser and on the server
// (server/chat/departureCounts.js). With `admins`, a removal signed by an admin whose key this
// person confirmed counts too: that's for someone who manages the conversation deciding to act on
// it, signing the next list themselves, never for checking a list someone else signed.
export default async function departureCounts(proofs: string[], channelId: string, userId: string, history: ChatRoster[], { admins = false } = {}) {
  const prev = history[history.length - 1];
  if (!prev) return false;
  const users = store.get().users;
  const me = store.get().me?.id;
  const keys = admins ? await keyDirectory.load() : null;
  const vouched = (id: string) => Boolean(keys) && isAdmin(users[id]) && !users[id]?.deactivated && (id === me || keys!.get(id)?.state === 'confirmed');
  for (const raw of proofs) {
    const d = await departures.check(raw, channelId, userId);
    if (d && (d.kind === 'leave' || rosterLead(prev).includes(d.by) || vouched(d.by)) && d.at >= joinedAt(history, userId)) return true;
  }
  return false;
}
