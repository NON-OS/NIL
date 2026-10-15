import Avatar from './Avatar';
import type User from '../../types/User';

export default function AvatarStack({ users, size = 22, max = 4 }: { users: User[]; size?: number; max?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {extra > 0 && (
        <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: 'var(--surface-3)', color: 'var(--ink-2)' }}>
          +{extra}
        </span>
      )}
    </span>
  );
}
