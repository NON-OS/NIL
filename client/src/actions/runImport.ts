import http from '../api/http';
import ApiError from '../api/ApiError';
import store from '../state/store';
import dates from '../lib/dates';
import foldText from '../lib/foldText';
import clip from '../lib/import/clip';
import tasks from './tasks';
import projects from './projects';
import vault from './vault';
import commentPayload from './commentPayload';
import type ImportItem from '../types/ImportItem';
import type ImportPlan from '../types/ImportPlan';
import type ImportProgress from '../types/ImportProgress';
import type Task from '../types/Task';

// A few tasks at a time: quick for big files without crowding out the people working in the
// app meanwhile.
const AT_ONCE = 4;
const TRIES = 5;
const BACKOFF_MS = 2000;
const SHOWN_ERRORS = 5;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// checklist items need their own ids before a private task's checklist is sealed
const itemId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

// When the server says "too many at once", wait a little longer each time and try again.
async function patiently<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 429) || attempt >= TRIES) throw err;
      await pause(BACKOFF_MS * attempt);
    }
  }
}

// An imported comment says who wrote it and when, since here it's posted by whoever imports.
function commentText(c: ImportItem['comments'][number]) {
  const by = [c.author, c.date].filter(Boolean).join(' on ');
  return clip(by ? `${by}:\n\n${c.text}` : c.text, 10_000);
}

// Creates the tasks through the same calls the app uses everywhere else. Private tasks go
// through the browser's sealing path, so they're encrypted from their first save; comments
// on them are sealed the same way.
export default async function runImport(plan: ImportPlan, report: (progress: ImportProgress) => void, stopped: () => boolean): Promise<ImportProgress> {
  const progress: ImportProgress = { total: plan.items.length, done: 0, failed: 0, errors: [], finished: false, stopped: false };
  const update = (patch: Partial<ImportProgress>) => {
    Object.assign(progress, patch);
    report({ ...progress });
  };
  const fail = (title: string, err: unknown) => {
    progress.failed++;
    const reason = err instanceof Error ? err.message : 'Something went wrong.';
    if (progress.errors.length < SHOWN_ERRORS) progress.errors.push(`${title}: ${reason}`);
  };

  // the wallet is asked once, up front, rather than in the middle of the import
  if (plan.makePrivate) await vault.unlock();

  const projectIds = new Map<string, string | null>();
  for (const [name, target] of Object.entries(plan.projects)) {
    if (!target) projectIds.set(name, null);
    else if ('id' in target) projectIds.set(name, target.id);
    else projectIds.set(name, (await projects.create({ name: clip(name, 80) }))?.id ?? null);
  }
  const labels = new Map(Object.values(store.get().labels).map((l) => [foldText(l.name), l.id]));
  const today = dates.today();

  const input = (item: ImportItem): Partial<Task> => ({
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    // a repeating task needs a date to repeat from
    dueDate: item.dueDate ?? (item.recurrence ? today : null),
    recurrence: item.recurrence,
    assigneeId: item.person ? plan.people[item.person] ?? null : null,
    projectId: item.project ? projectIds.get(item.project) ?? null : null,
    labels: [...new Set(item.labels.map((l) => labels.get(foldText(l))).filter((id): id is string => Boolean(id)))].slice(0, 20),
    checklist: item.checklist.map((c) => ({ id: itemId(), text: c.text, done: c.done })),
    private: plan.makePrivate,
  });

  let next = 0;
  const worker = async () => {
    while (next < plan.items.length && !stopped()) {
      const item = plan.items[next++];
      try {
        const task = await patiently(() => tasks.add(input(item)));
        for (const comment of item.comments) {
          const body = commentText(comment);
          await patiently(async () => http.post(`/tasks/${task.id}/comments`, await commentPayload(task.id, body)));
        }
        progress.done++;
      } catch (err) {
        fail(item.title, err);
      }
      update({});
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  update({ finished: true, stopped: stopped() });
  return { ...progress };
}
