import './Avatar.css';
import { UserRoundPlus } from 'lucide-react';
import cx from '../../lib/cx';
import textOn from '../../lib/textOn';
import type User from '../../types/User';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

interface Props {
  user: User | null | undefined;
  size?: number;
  online?: boolean;
  title?: string;
}

export default function Avatar({ user, size = 22, online = false, title }: Props) {
  // nobody yet: an open seat to fill, drawn as an invitation rather than a question mark
  if (!user) {
    return (
      <span className="avatar avatar-empty" style={{ width: size, height: size }} title={title ?? 'Unassigned'}>
        <UserRoundPlus size={Math.round(size * 0.62)} strokeWidth={1.75} aria-hidden="true" />
      </span>
    );
  }
  const agent = user.kind === 'agent';
  return (
    <span
      className={cx('avatar', online && 'avatar-online', agent && 'avatar-agent')}
      style={{ width: size, height: size, fontSize: size * 0.4, background: user.color, color: textOn(user.color) }}
      title={title ?? (agent ? `${user.name} (agent)` : user.name)}
      aria-label={agent ? `${user.name}, agent` : user.name}
    >
      {initials(user.name)}
    </span>
  );
}
