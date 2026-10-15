import http from '../api/http';
import store from '../state/store';
import toast from '../state/toast';
import type TimeEntry from '../types/TimeEntry';

const timer = {
  async start(taskId?: string, note?: string) {
    try {
      const res = await http.post<{ timer: TimeEntry }>('/time/start', { taskId, note });
      store.set({ timer: res.timer });
    } catch (err) {
      toast.error(err);
    }
  },

  async stop() {
    try {
      await http.post('/time/stop');
      store.set({ timer: null });
    } catch (err) {
      toast.error(err);
    }
  },

  list: (from: number, to: number) => http.get<{ timer: TimeEntry | null; entries: TimeEntry[] }>(`/time?from=${from}&to=${to}`),
  log: (input: { taskId?: string | null; note: string; startedAt: number; endedAt: number }) => http.post<{ entry: TimeEntry }>('/time', input),
  remove: (id: string) => http.del(`/time/${id}`),
};

export default timer;
