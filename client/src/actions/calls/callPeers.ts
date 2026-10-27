import keyDirectory from '../keyDirectory';
import callRuntime from './callRuntime';
import sfuKeys from './sfuKeys';
import type CallPeer from '../../types/CallPeer';

const rt = callRuntime;

// The people in the call this tab is in, the same whether the call goes browser to browser or
// over the SFU.
const callPeers = {
  blank: (userId: string, session: string): CallPeer => ({ userId, session, link: 'connecting', trust: 'unknown', refusal: null, held: true, holding: false, mic: true, cam: false, screen: false, quality: null, speaking: false, media: null, screenMedia: null }),

  add(userId: string, session: string) {
    rt.patch((a) => ({ peers: { ...a.peers, [userId]: callPeers.blank(userId, session) } }));
    void keyDirectory.load().then((keys) => callPeers.trusted(userId, keys.get(userId)?.state ?? 'none', session));
  },

  remove(userId: string) {
    rt.patch((x) => ({ peers: Object.fromEntries(Object.entries(x.peers).filter(([id]) => id !== userId)) }));
  },

  // Someone whose key this person confirmed hears and sees them from the start. Anyone else is
  // sent nothing until this person checks the key or says to go ahead (allow), so a key the
  // server slipped in never gets a picture or a word.
  trusted(userId: string, trust: CallPeer['trust'], session: string) {
    const wasHeld = rt.active()?.peers[userId]?.held;
    rt.patchPeer(userId, { trust, ...(trust === 'confirmed' ? { held: false } : {}) }, session);
    if (wasHeld && trust === 'confirmed') callPeers.released(userId);
  },

  // starts sending to someone: on the mesh their connection's slots, on the SFU the frame key
  released(userId: string) {
    rt.links.get(userId)?.release();
    sfuKeys.share(userId);
  },
};

export default callPeers;
