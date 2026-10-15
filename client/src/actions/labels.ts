import http from '../api/http';
import store from '../state/store';
import records from '../state/records';
import toast from '../state/toast';
import type Label from '../types/Label';

const put = (label: Label) => store.set((s) => ({ labels: records.put(s.labels, label) }));

const labels = {
  async create(name: string, color?: string) {
    try {
      const { label } = await http.post<{ label: Label }>('/labels', { name, color });
      put(label);
      return label;
    } catch (err) {
      toast.error(err);
      return null;
    }
  },

  async update(id: string, patch: Partial<Label>) {
    try {
      const { label } = await http.patch<{ label: Label }>(`/labels/${id}`, patch);
      put(label);
    } catch (err) {
      toast.error(err);
    }
  },

  async remove(id: string) {
    try {
      await http.del(`/labels/${id}`);
      store.set((s) => ({ labels: records.drop(s.labels, id) }));
    } catch (err) {
      toast.error(err);
    }
  },
};

export default labels;
