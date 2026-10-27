import store from '../../state/store';
import keyring from '../../state/keyring';
import chatKeyring from '../../state/chatKeyring';
import chatKeySeal from '../../lib/crypto/chatKeySeal';
import keyHash from '../../lib/crypto/keyHash';
import keyDirectory from '../keyDirectory';
import chatRosters, { type Chain } from './chatRosters';
import type ChatChannelRow from '../../types/ChatChannelRow';

export type Grant = { userId: string; wrappedKey: string };

// Epoch keys. A key counts only when it's the one its epoch's signed member list names by hash:
// a server that seals some other key to you (one it made, say) is caught here, before anything
// is read or written under it.
const chatKeys = {
  async get(channel: ChatChannelRow, chain: Chain, epoch: number): Promise<Uint8Array | null> {
    const held = chatKeyring.get(channel.id, epoch);
    if (held) return held;
    const roster = chatRosters.at(chain, epoch);
    const id = keyring.identity();
    if (!roster || !id) return null;
    const wrapped = roster.wrappedKey ?? (epoch === channel.epoch ? channel.wrappedKey : epoch === channel.metaEpoch ? channel.metaKey : null);
    if (!wrapped) return null;
    const key = await chatKeySeal.open(wrapped, id.privateKey, id.publicKey).catch(() => null);
    if (!key || keyHash(key) !== roster.key) throw new Error('The key the server handed over for this conversation isn’t the one its members were given.');
    chatKeyring.put(channel.id, epoch, key);
    return key;
  },

  fresh: () => crypto.getRandomValues(new Uint8Array(32)),

  // Seals a key to this person's own key, and to each of `userIds` whose key they've confirmed.
  // Anyone else is left out; who was sealed to is what the member list will say.
  async seal(key: Uint8Array, userIds: string[]): Promise<Grant[]> {
    const me = store.get().me!.id;
    const id = keyring.identity();
    if (!id) throw new Error('Unlock your keys first.');
    const others = await keyDirectory.sharable(userIds.filter((u) => u !== me));
    const grants: Grant[] = [{ userId: me, wrappedKey: await chatKeySeal.seal(key, id.publicKey) }];
    for (const [userId, publicKey] of others) grants.push({ userId, wrappedKey: await chatKeySeal.seal(key, publicKey) });
    return grants;
  },
};

export default chatKeys;
