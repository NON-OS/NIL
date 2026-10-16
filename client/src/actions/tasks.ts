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
import vault from './vault';
import taskKeys from './taskKeys';
import taskSeal from './taskSeal';
import patchTask from './patchTask';

// A new private task is sealed here before it leaves the browser: its words go out encrypted
// under a fresh key that only the creator and the assignee hold.
async function sealedNew(input: Partial<Task> & { dueTime?: string | null }) {
  await vault.unlock();
  const { title = '', description = '', checklist = [], ...rest } = input;
  const fresh = taskKeys.fresh();
  const keys = await taskKeys.wrap(fresh.key, [store.get().me!.id, input.assigneeId ?? null]);
  return { ...rest, private: true, sealed: await taskSeal.seal({ title, description, checklist }, fresh, keys) };
}

type NewTask = Partial<Task> & { dueTime?: string | null };

// A due time only means something on a clock, so this browser's time zone goes with it.
const withZone = <T extends object>(body: T): T => ((body as { dueTime?: unknown }).dueTime ? { ...body, timeZone: dates.zone() } : body);

// What the due moment becomes after a patch, worked out here so the list updates at once.
function dueAtAfter(task: Task, date: string | null | undefined, time: string | null | undefined) {
  const day = date === undefined ? task.dueDate : date;
  const clock = time === undefined ? (task.dueAt ? dates.clock(task.dueAt) : null) : time;
  return day && clock ? dates.at(day, clock) : null;
}

const tasks = {
  async create(input: NewTask): Promise<Task | null> {
    try {
      const { task } = await http.post<{ task: Task }>('/tasks', withZone(input.private ? await sealedNew(input) : input));
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
    const { dueTime, listed, ...fields } = patch;
    const optimistic: Task = { ...before, ...fields };
    if ('dueDate' in patch || 'dueTime' in patch) optimistic.dueAt = dueAtAfter(before, fields.dueDate, dueTime);
    if (patch.status && patch.status !== before.status) optimistic.completedAt = patch.status === 'done' ? Date.now() : null;
    putTask(optimistic);
    try {
      const res = await patchTask(before, patch, { today: dates.today(), ...(dueTime ? { timeZone: dates.zone() } : {}) });
      putTask(res.task);
      if (res.spawned) {
        putTask(res.spawned);
        // the server copies a private task's sealed checklist as it was; clear the ticks here
        const copy = store.get().tasks[res.spawned.id];
        if (copy?.sealed && !copy.locked && copy.checklist?.some((i) => i.done)) {
          void tasks.update(copy.id, { checklist: copy.checklist.map((i) => ({ ...i, done: false })) }, { quiet: true });
        }
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
