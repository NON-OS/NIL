import type Role from './Role';

export default interface Invite {
  id: string;
  role: Role;
  // guests only: the projects they'll be able to see
  projectIds: string[];
  createdAt: number;
  expiresAt: number;
  createdBy: string | null;
  // a reusable link lets several people in; a single-use one has maxUses 1
  reusable: boolean;
  // null: no limit until it expires
  maxUses: number | null;
  uses: number;
  revokedAt: number | null;
  live: boolean;
  // admins only: who came in through this link
  joined: { userId: string; joinedAt: number }[];
}
