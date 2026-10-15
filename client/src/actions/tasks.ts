import http from '../api/http';
import store from '../state/store';
import records from '../state/records';
import putTask from '../state/putTask';
import toast from '../state/toast';
import router from '../lib/router';
import dates from '../lib/dates';
import taskKey from '../lib/taskKey';
import type Task from '../types/Task';
import type TaskPatch from '../types/TaskPatch';

const tasks = {
  async create(input: Partial<Task>): Promise<Task | null> {
    try {
      const { task } = await http.post<{ task: Task }>('/tasks', input);
      putTask(task);
      return task;
    } catch (err) {
      toast.error(err);
      return null;
    }
  },

  // Applied locally first so the UI never waits on the network; rolled back if refused.
  async update(id: string, patch: TaskPatch, { quiet = false } = {}) {
    const before = store.get().tasks[id];
    if (!before) return null;
    const optimistic = { ...before, ...patch };
    if (patch.status && patch.status !== before.status) optimistic.completedAt = patch.status === 'done' ? Date.now() : null;
    putTask(optimistic);
    try {
      const res = await http.patch<{ task: Task; spawned: Task | null }>(`/tasks/${id}`, { ...patch, today: dates.today() });
      putTask(res.task);
      if (res.spawned) {
        putTask(res.spawned);
        if (!quiet) toast.show(`Next one is ${taskKey(res.spawned)}, due ${dates.relative(res.spawned.dueDate!)}`, { tone: 'success' });
      }
      return res.task;
    } catch (err) {
      if (store.get().tasks[id]) putTask(before);
      toast.error(err);
      return null;
    }
  },

  async toggleDone(task: Task) {
    const finishing = task.status !== 'done';
    const updated = await tasks.update(task.id, { status: finishing ? 'done' : 'todo' });
    if (updated && finishing && !task.recurrence) {
      toast.show(`Completed ${taskKey(task)}`, { tone: 'success', action: { label: 'Undo', run: () => tasks.update(task.id, { status: task.status }) } });
    }
  },

  async remove(task: Task) {
    store.set((s) => ({ tasks: records.drop(s.tasks, task.id) }));
    if (router.param('task') === String(task.number)) router.setParam('task', null, { replace: true });
    try {
      await http.del(`/tasks/${task.id}`);
      toast.show(`Deleted ${taskKey(task)}`, { action: { label: 'Undo', run: () => tasks.restore(task.id) } });
    } catch (err) {
      putTask(task);
      toast.error(err);
    }
  },

  async restore(id: string) {
    try {
      const { task } = await http.post<{ task: Task }>(`/tasks/${id}/restore`);
      putTask(task);
    } catch (err) {
      toast.error(err);
    }
  },

  async bulkUpdate(ids: string[], patch: Record<string, unknown>, message: string) {
    const snapshot = ids.map((id) => store.get().tasks[id]).filter(Boolean);
    try {
      const res = await http.post<{ tasks: Task[] }>('/tasks/bulk', { ids, patch, today: dates.today() });
      res.tasks.forEach(putTask);
      toast.show(message, {
        action: {
          label: 'Undo',
          run: async () => {
            for (const t of snapshot) {
              const { status, priority, assigneeId, projectId, dueDate, labels } = t;
              await tasks.update(t.id, { status, priority, assigneeId, projectId, dueDate, labels }, { quiet: true });
            }
          },
        },
      });
    } catch (err) {
      toast.error(err);
    }
  },

  async bulkRemove(ids: string[]) {
    const snapshot = ids.map((id) => store.get().tasks[id]).filter(Boolean);
    store.set((s) => ({ tasks: ids.reduce((map, id) => records.drop(map, id), s.tasks) }));
    try {
      await http.post('/tasks/bulk', { ids, action: 'delete' });
      toast.show(`Deleted ${ids.length} task${ids.length === 1 ? '' : 's'}`, {
        action: {
          label: 'Undo',
          run: async () => {
            const res = await http.post<{ tasks: Task[] }>('/tasks/bulk', { ids, action: 'restore' });
            res.tasks.forEach(putTask);
          },
        },
      });
    } catch (err) {
      snapshot.forEach(putTask);
      toast.error(err);
    }
  },
};

export default tasks;
