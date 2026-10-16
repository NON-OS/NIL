import http from '../api/http';
import type SignInReset from '../types/SignInReset';
import type SignInAuditEntry from '../types/SignInAuditEntry';

interface Started {
  reset: SignInReset;
  // only when the link exists right away; an owner's reset may wait for a second admin first
  token?: string;
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

// Admin side of "Reset sign-in". Member rows start resets; the resets card lists and approves them.
const signInResets = {
  overview: () => http.get<{ resets: SignInReset[]; log: SignInAuditEntry[] }>('/sign-in-resets'),

  async start(userId: string, acknowledged = false) {
    const out = await http.post<Started>(`/users/${encodeURIComponent(userId)}/sign-in-reset`, { acknowledged });
    changed();
    return out;
  },

  async approve(id: string) {
    const out = await http.post<Required<Started>>(`/sign-in-resets/${encodeURIComponent(id)}/approve`);
    changed();
    return out;
  },

  async cancel(id: string) {
    await http.del(`/sign-in-resets/${encodeURIComponent(id)}`);
    changed();
  },

  link: (token: string) => `${location.origin}/reset/${token}`,

  onChange(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export default signInResets;
