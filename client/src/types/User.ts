import type Role from './Role';

export default interface User {
  id: string;
  name: string;
  title: string;
  role: Role;
  color: string;
  deactivated: boolean;
  createdAt: number;
  // only filled in for admins and for your own account
  address: string | null;
  lastSeenAt: number | null;
  joinedVia: 'setup' | 'invite' | 'holder' | null;
  // where private payouts go (admins and yourself only); null when private payouts are off
  stealthMeta: string | null;
}
