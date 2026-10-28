import store from '../../state/store';
import keyDirectory from '../keyDirectory';
import chatRosters from './chatRosters';
import settingsMatch from '../../lib/settingsMatch';
import sealBlockers, { type Blocker } from '../../lib/sealBlockers';
import type ChatChannel from '../../types/ChatChannel';

const WHY: Record<Blocker, string> = {
  history: 'The server showed this conversation as it was before its newest key. Nothing is sent until it shows the newest again.',
  settings: 'This conversation’s settings on the server aren’t the ones its manager signed. Nothing is sent until they are.',
  unconfirmed: 'Check the keys of everyone in this conversation before writing here.',
  holdsOut: 'Someone who left still holds this conversation’s key. It goes out once a new key starts.',
};

// Nothing is sealed under a key unless this browser confirmed the key of everyone the key was
// sealed to, its signer included (every list names whoever signed it): a member list could name
// an account the server made, or a key it swapped in, and whatever is written would then be the
// server's to read. Nor while someone who is out of the conversation still holds its key: what's
// written waits for the next key, which any member's browser starts on its own once their
// departure is signed. Nor while the server shows an older key than this browser checked, or
// another history, or settings other than the signed ones. sealBlockers is the rule; this
// gathers what it needs and throws with the reason. Signing the settings again is the one thing
// that goes ahead while the server's copy differs (`settings: false`), since it mends it.
export default async function sealGate(channel: ChatChannel, { settings = true } = {}) {
  const chain = await chatRosters.load(channel);
  const head = chatRosters.at(chain, channel.epoch);
  const seen = chatRosters.seenEpoch(channel.id);
  if (chain.forked || channel.epoch < seen) throw new Error(WHY.history);
  if (!head) throw new Error('This conversation’s member list didn’t check out, so nothing can be sent here.');
  const keys = await keyDirectory.load();
  const blocker = sealBlockers({
    me: store.get().me?.id ?? '',
    holders: head.members,
    confirmed: head.members.filter((id) => keys.get(id)?.state === 'confirmed'),
    members: channel.members,
    epoch: channel.epoch,
    seen,
    forked: chain.forked,
    settingsOk: !settings || channel.metaState === 'locked' || settingsMatch(channel),
  });
  if (blocker) throw new Error(WHY[blocker]);
  return chain;
}
