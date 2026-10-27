import { Hash, Lock, Users } from 'lucide-react';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import type ChatChannel from '../../types/ChatChannel';

// A team channel is a hash, a channel for some people a lock, a group a pair of people, and a
// direct message the other person's face.
export default function ChannelIcon({ channel, size = 18 }: { channel: ChatChannel; size?: number }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  if (channel.kind === 'dm') {
    const other = channel.members.find((id) => id !== me);
    return <Avatar user={other ? users[other] : null} size={size} />;
  }
  if (channel.kind === 'group') return <Users aria-hidden="true" />;
  return channel.audience === 'team' ? <Hash aria-hidden="true" /> : <Lock aria-hidden="true" />;
}
