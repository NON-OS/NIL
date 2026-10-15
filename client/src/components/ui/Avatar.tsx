import './Avatar.css';
import cx from '../../lib/cx';
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
  if (!user) {
    return (
      <span className="avatar avatar-empty" style={{ width: size, height: size, fontSize: size * 0.42 }} title={title ?? 'Unassigned'}>
        ?
      </span>
    );
  }
  return (
    <span
      className={cx('avatar', online && 'avatar-online')}
      style={{ width: size, height: size, fontSize: size * 0.4, background: user.color }}
      title={title ?? user.name}
      aria-label={user.name}
    >
      {initials(user.name)}
    </span>
  );
}
