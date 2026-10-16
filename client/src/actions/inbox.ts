import http from '../api/http';
import store from '../state/store';
import toast from '../state/toast';
import type InboxItem from '../types/InboxItem';
import type Activity from '../types/Activity';

const inbox = {
  async load() {
    try {
      store.set({ inbox: await http.get<InboxItem[]>('/notifications?limit=150') });
    } catch (err) {
      toast.error(err);
    }
  },

  async markRead(ids: number[]) {
    if (!ids.length) return;
    const now = Date.now();
    store.set((s) => ({ inbox: s.inbox?.map((n) => (ids.includes(n.id) && !n.readAt ? { ...n, readAt: now } : n)) ?? null }));
    try {
      const { unread } = await http.post<{ unread: number }>('/notifications/read', { ids });
      store.set({ unread });
    } catch (err) {
      toast.error(err);
    }
  },

  async markAllRead() {
    const now = Date.now();
    store.set((s) => ({ unread: 0, inbox: s.inbox?.map((n) => (n.readAt ? n : { ...n, readAt: now })) ?? null }));
    try {
      await http.post('/notifications/read', { all: true });
    } catch (err) {
      toast.error(err);
    }
  },

  async loadFeed() {
    try {
      store.set({ feed: await http.get<Activity[]>('/activity?limit=150') });
    } catch (err) {
      toast.error(err);
    }
  },
};

export default inbox;
