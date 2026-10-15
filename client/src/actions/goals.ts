import http from '../api/http';
import store from '../state/store';
import records from '../state/records';
import toast from '../state/toast';
import type Goal from '../types/Goal';

const put = (goal: Goal) => store.set((s) => ({ goals: records.put(s.goals, goal) }));

const goals = {
  async create(input: Partial<Goal>) {
    try {
      const { goal } = await http.post<{ goal: Goal }>('/goals', input);
      put(goal);
      return goal;
    } catch (err) {
      toast.error(err);
      return null;
    }
  },

  async update(id: string, patch: Partial<Goal>) {
    const before = store.get().goals[id];
    if (before) put({ ...before, ...patch });
    try {
      const { goal } = await http.patch<{ goal: Goal }>(`/goals/${id}`, patch);
      put(goal);
    } catch (err) {
      if (before) put(before);
      toast.error(err);
    }
  },

  async remove(id: string) {
    try {
      await http.del(`/goals/${id}`);
      store.set((s) => ({ goals: records.drop(s.goals, id) }));
      toast.show('Goal deleted. Linked tasks were kept.');
    } catch (err) {
      toast.error(err);
    }
  },
};

export default goals;
