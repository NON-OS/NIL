import store from '../../state/store';
import keyDirectory from '../keyDirectory';
import chatRosters, { type Chain } from './chatRosters';
import type ChatChannelRow from '../../types/ChatChannelRow';

// Whose keys this browser hasn't confirmed among everyone who holds the conversation's current
// key, its signer included (every list names whoever signed it). Empty when sealing is safe.
async function unconfirmed(channel: ChatChannelRow, chain: Chain) {
  const head = chatRosters.at(chain, channel.epoch);
  if (!head) throw new Error('This conversation’s member list didn’t check out, so nothing can be sent here.');
  const me = store.get().me?.id;
  const keys = await keyDirectory.load();
  return head.members.filter((id) => id !== me && keys.get(id)?.state !== 'confirmed');
}

// Nothing is sealed under a key unless this browser confirmed the key of everyone the key was
// sealed to: a member list could name an account the server made, or a key it swapped in, and
// whatever is written would then be the server's to read. Nor while someone who is out of the
// conversation still holds its key: what's written waits for the next key, which any member's
// browser starts on its own once their departure is signed. Throws when either is so; the
// conversation's notices name who and offer what to do.
export default async function sealGate(channel: ChatChannelRow) {
  const chain = await chatRosters.load(channel);
  if ((await unconfirmed(channel, chain)).length) throw new Error('Check the keys of everyone in this conversation before writing here.');
  if (chatRosters.at(chain, channel.epoch)!.members.some((id) => !channel.members.includes(id))) throw new Error('Someone who left still holds this conversation’s key. It goes out once a new key starts.');
  return chain;
}
