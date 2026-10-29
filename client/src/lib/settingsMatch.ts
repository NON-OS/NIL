import type ChatChannel from '../types/ChatChannel';

// Whether the server's copy of a conversation's disappearing and forward-secrecy settings is the
// one whoever manages it signed, with nothing signed meaning neither is on. The server acts on
// its copy, so one that differs would keep what should go, or hide that it should.
export default function settingsMatch(channel: ChatChannel) {
  if (channel.metaState === 'unverified') return false;
  const signed = channel.signedSettings ?? { disappear: null, forward: null };
  return signed.disappear === channel.disappearSeconds && signed.forward === channel.forwardDays;
}
