import type Role from './Role';

export default interface Invite {
  id: string;
  email: string | null;
  role: Role;
  createdAt: number;
  expiresAt: number;
  createdBy: string | null;
}
