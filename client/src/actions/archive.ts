import http from '../api/http';
import store from '../state/store';
import putTasks from '../state/putTasks';
import cursorTime from '../lib/cursorTime';
import type Task from '../types/Task';
import type TaskArchive from '../types/TaskArchive';

interface Page {
  tasks: Task[];
  cursor: string | null;
}

const PAGE = 500;
const MAX_IDS = 100;
// a search shows its best few; the most recent matches are plenty to pick them from
const SEARCH_PAGE = 200;

let paging: Promise<void> | null = null;
// what's been fetched since the last bootstrap, which replaces every task loaded here
const fetched = new Set<string>();

function query(current: TaskArchive, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams({ before: String(current.before) });
  for (const [key, value] of Object.entries(params)) q.set(key, String(value));
  return q.toString();
}

// Fetches something once per bootstrap. A failed fetch is forgotten, so the next ask retries.
async function once(keys: string[], load: () => Promise<void>) {
  const fresh = keys.filter((key) => !fetched.has(key));
  if (!fresh.length) return;
  fresh.forEach((key) => fetched.add(key));
  try {
    await load();
  } catch (err) {
    fresh.forEach((key) => fetched.delete(key));
    throw err;
  }
}

// The pages a filter matches, all of them unless told otherwise. Pages for an archive a fresh
// bootstrap has since replaced are dropped rather than mixed into the new one.
async function fetchAll(params: Record<string, string | number>, { limit = PAGE, pages = Infinity } = {}) {
  const current = store.get().archive;
  let cursor: string | null = null;
  for (let n = 0; n < pages; n++) {
    const page: Page = await http.get<Page>(`/tasks/archive?${query(current, { ...params, limit, ...(cursor ? { cursor } : {}) })}`);
    if (store.get().archive.before !== current.before) return;
    putTasks(page.tasks);
    cursor = page.cursor;
    if (!cursor) return;
  }
}

async function nextPage() {
  const current = store.get().archive;
  if (!current.cursor) return;
  const page = await http.get<Page>(`/tasks/archive?${query(current, { cursor: current.cursor, limit: PAGE })}`);
  const now = store.get().archive;
  if (now.before !== current.before || now.cursor !== current.cursor) return;
  putTasks(page.tasks);
  store.set({ archive: { ...now, cursor: page.cursor } });
}

// Older closed tasks stay on the server until a view needs them; these bring them in. A null
// cursor means every archived task is already here (or there are none), so there's nothing to
// fetch then.
const archive = {
  // A bootstrap replaces the tasks, and with them everything fetched from the archive so far.
  reset() {
    fetched.clear();
  },

  // The next page of older closed tasks, newest first. Calls made while one is on its way wait
  // for it instead of asking for the same page twice.
  more(): Promise<void> {
    paging ??= nextPage().finally(() => {
      paging = null;
    });
    return paging;
  },

  // Whether every closed task touched since `time` is already here.
  covers(time: number) {
    const { cursor } = store.get().archive;
    return !cursor || cursorTime(cursor) < time;
  },

  // Every closed task touched since `time`, for views that look back over a period.
  async since(time: number) {
    for (let cursor = store.get().archive.cursor; cursor && cursorTime(cursor) >= time; cursor = store.get().archive.cursor) {
      await archive.more();
      if (store.get().archive.cursor === cursor) return;
    }
  },

  // Archived tasks due between two dates, for the calendar.
  async due(from: string, to: string) {
    if (store.get().archive.cursor) await once([`due:${from}:${to}`], () => fetchAll({ dueFrom: from, dueTo: to }));
  },

  // Archived tasks with a bounty, paid or not, for totals that cover all time.
  async bounties() {
    if (store.get().archive.cursor) await once(['bounties'], () => fetchAll({ bounty: 1 }));
  },

  // Archived tasks whose titles hold every word of a search, or whose key it names. Sealed
  // titles are ciphertext the server can't search, so with `sealed` those all come along once,
  // to be opened and searched in the browser.
  async search(text: string, { sealed = false } = {}) {
    if (!store.get().archive.cursor) return;
    await once([`q:${text.toLowerCase()}`], () => fetchAll({ q: text }, { limit: SEARCH_PAGE, pages: 1 }));
    if (sealed) await once(['sealed'], () => fetchAll({ sealed: 1 }));
  },

  // Tasks other screens point at (a notification, a timer entry) that this tab doesn't hold.
  async find(ids: (string | null | undefined)[]) {
    const { tasks: held, archive: current } = store.get();
    if (!current.cursor) return;
    const missing = [...new Set(ids)].filter((id): id is string => Boolean(id) && !held[id!] && !fetched.has(`id:${id}`));
    for (let i = 0; i < missing.length; i += MAX_IDS) {
      const batch = missing.slice(i, i + MAX_IDS);
      await once(
        batch.map((id) => `id:${id}`),
        () => fetchAll({ ids: batch.join(',') }),
      );
    }
  },

  // The archived task with this number, for a link to it. Null if there's none to see.
  async byNumber(number: number): Promise<Task | null> {
    const current = store.get().archive;
    if (!current.cursor) return null;
    const { tasks } = await http.get<Page>(`/tasks/archive?${query(current, { number, limit: 1 })}`);
    putTasks(tasks);
    return tasks[0] ?? null;
  },

  // How many archived tasks carry each label, loaded here or not, for the label settings.
  async labelCounts(): Promise<Record<string, number>> {
    return (await http.get<{ labels: Record<string, number> }>(`/tasks/archive/summary?${query(store.get().archive, { labels: 1 })}`)).labels;
  },
};

export default archive;
