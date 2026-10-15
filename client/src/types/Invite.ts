import type Role from './Role';

export default interface Invite {
  id: string;
  role: Role;
  // guests only: the projects they'll be able to see
  projectIds: string[];
  createdAt: number;
  expiresAt: number;
  createdBy: string | null;
}
