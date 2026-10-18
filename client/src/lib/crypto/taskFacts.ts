import factChecks from './factChecks';
import type { TaskField } from './taskText';

// Who a private task is for: its creator and its assignee, in that order.
export type TaskReaders = [string | null, string | null];

export interface TaskFacts {
  rev: number;
  // when the writer sealed these words, which tells a reader which of their keys applies
  at: number;
  readers: TaskReaders;
  // the assignee who handed the task on and made this key, when the writer isn't a reader any more
  from: string | null;
  // the hash of the task key the words were sealed under (see keyHash)
  key: string;
}

const LIMIT = 2 ** 31;
const reader = (v: unknown) => v === null || factChecks.person(v);

// What the writer of a private task signs next to each of its title, notes and checklist, from
// format 2 on: the revision, the time, who the task is for and which key protects it.
const taskFacts = {
  kind: 'nil/task-words/v2',
  place: (sealId: string, field: TaskField) => [sealId, field],
  list: (f: TaskFacts) => [f.rev, f.at, f.readers[0], f.readers[1], f.from, f.key],

  parse(list: unknown[]): TaskFacts {
    const [rev, at, creator, assignee, from, key] = list;
    const people = reader(creator) && reader(assignee) && Boolean(creator || assignee) && reader(from) && (from === null || (from !== creator && from !== assignee));
    if (list.length !== 6 || !factChecks.count(rev, LIMIT) || rev < 1 || !factChecks.time(at) || !people || !factChecks.hash(key)) throw new Error('This private task carries details Nil doesn’t accept.');
    return { rev, at, readers: [creator as string | null, assignee as string | null], from: from as string | null, key: key as string };
  },

  // Who may sign: one of the readers, or the assignee handing the task on, and nobody else.
  signer: (f: TaskFacts, by: string) => (f.from ? by === f.from : f.readers.includes(by)),
};

export default taskFacts;
