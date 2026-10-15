import type User from '../types/User';

// Owners and admins manage the workspace. Members and guests don't.
export default function isAdmin(user: Pick<User, 'role'> | null | undefined) {
  return user?.role === 'owner' || user?.role === 'admin';
}
