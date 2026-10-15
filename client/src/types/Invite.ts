import type Role from './Role';

export default interface Invite {
  id: string;
  role: Role;
  createdAt: number;
  expiresAt: number;
  createdBy: string | null;
}
