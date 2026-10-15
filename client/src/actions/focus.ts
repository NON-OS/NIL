import http from '../api/http';
import store from '../state/store';
import toast from '../state/toast';
import dates from '../lib/dates';
import type FocusItem from '../types/FocusItem';

// "My Day": a personal short list for today. Private to each person.
const focus = {
  async add(taskId: string) {
    try {
      const res = await http.post<{ focus: FocusItem[] }>('/focus', { taskId, day: dates.today() });
      store.set({ focus: res.focus });
    } catch (err) {
      toast.error(err);
    }
  },

  async remove(taskId: string) {
    store.set((s) => ({ focus: s.focus.filter((f) => f.taskId !== taskId) }));
    try {
      const res = await http.del<{ focus: FocusItem[] }>(`/focus/${taskId}`);
      store.set({ focus: res.focus });
    } catch (err) {
      toast.error(err);
    }
  },
};

export default focus;
