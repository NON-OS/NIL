import store from '../../state/store';
import type ChatChannel from '../../types/ChatChannel';

// What a conversation is called on screen: a channel's own name, or the people in a direct or
// group message, as its checked member list names them. A name that didn't check out, or can't be
// opened yet, isn't shown.
export default function chatTitle(channel: ChatChannel) {
  const { users, me } = store.get();
  if (channel.kind !== 'channel' && !channel.name) {
    const others = (channel.signedMembers ?? channel.members).filter((id) => id !== me?.id).map((id) => users[id]?.name ?? 'Someone');
    return others.length ? others.join(', ') : 'Just you';
  }
  if (channel.metaState === 'locked') return 'Locked channel';
  if (channel.metaState === 'unverified') return 'Unverified name';
  return channel.name || 'Untitled channel';
}
