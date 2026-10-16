import type Role from './Role';

export default interface User {
  id: string;
  name: string;
  title: string;
  role: Role;
  // 'agent' for an AI teammate set up in Settings → Agents; agents never sign in
  kind: 'human' | 'agent';
  color: string;
  deactivated: boolean;
  createdAt: number;
  // only filled in for admins and for your own account
  address: string | null;
  lastSeenAt: number | null;
  joinedVia: 'setup' | 'invite' | 'holder' | 'bounty' | 'agent' | null;
  // where private payouts go (admins and yourself only); null when private payouts are off
  stealthMeta: string | null;
  // your anonymous-voting key (Semaphore commitment); admins and yourself only
  semaphoreCommitment: string | null;
}
