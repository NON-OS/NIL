import http from '../api/http';
import store from '../state/store';
import records from '../state/records';
import toast from '../state/toast';
import type User from '../types/User';
import type Workspace from '../types/Workspace';
import type Invite from '../types/Invite';
import type Role from '../types/Role';
import type SharingPolicy from '../types/SharingPolicy';

const people = {
  async updateMe(patch: Partial<Pick<User, 'name' | 'title' | 'color'>>) {
    try {
      const { user } = await http.patch<{ user: User }>('/me', patch);
      store.set((s) => ({ me: user, users: records.put(s.users, user) }));
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    }
  },

  async update(id: string, patch: { role?: Role; deactivated?: boolean; keepWithoutNox?: boolean; projects?: string[] }) {
    try {
      const { user } = await http.patch<{ user: User }>(`/users/${id}`, patch);
      store.set((s) => ({ users: records.put(s.users, user) }));
    } catch (err) {
      toast.error(err);
    }
  },

  async erase(id: string) {
    try {
      await http.del(`/users/${id}`);
      store.set((s) => ({ users: records.drop(s.users, id) }));
      toast.show('Account deleted permanently.');
    } catch (err) {
      toast.error(err);
    }
  },

  async updateWorkspace(patch: Partial<Workspace>) {
    try {
      const { workspace } = await http.patch<{ workspace: Workspace }>('/workspace', patch);
      store.set({ workspace });
      toast.show('Workspace saved.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  },

  invites: () => http.get<Invite[]>('/invites'),
  invite: (input: { role: Role; projectIds?: string[]; days?: number }) => http.post<{ token: string; invite: Invite }>('/invites', input),
  async setSharing(patch: Partial<SharingPolicy>) {
    try {
      store.set({ sharing: await http.put<SharingPolicy>('/sharing', patch) });
    } catch (err) {
      toast.error(err);
    }
  },
  revokeInvite: (id: string) => http.del(`/invites/${encodeURIComponent(id)}`),
};

export default people;
