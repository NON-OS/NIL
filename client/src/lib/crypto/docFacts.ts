import factChecks from './factChecks';
import type { DocPlace } from './docText';

export interface DocFacts {
  audience: 'team' | 'people';
  // who the writer sealed or saved this version for, sorted
  readers: string[];
  // the hash of the doc key the version was encrypted under (see keyHash)
  key: string;
  at: number;
}

// What whoever saves a version of a doc signs next to its title and body, from format 2 on: who
// it's for (the whole team, or the people listed), which key protects it and when it was saved.
const docFacts = {
  kind: 'nil/doc-version/v2',
  place: ({ docId, field, version }: DocPlace) => [docId, field, version],
  list: (f: DocFacts) => [f.audience, f.readers, f.key, f.at],
  readers: (ids: (string | null)[]) => [...new Set(ids.filter((id): id is string => Boolean(id)))].sort(),

  parse(list: unknown[]): DocFacts {
    const [audience, readers, key, at] = list;
    const people = Array.isArray(readers) && readers.length <= 500 && readers.every(factChecks.person) && readers.every((id, i) => i === 0 || readers[i - 1] < id);
    if (list.length !== 4 || (audience !== 'team' && audience !== 'people') || !people || !factChecks.hash(key) || !factChecks.time(at)) throw new Error('This doc carries details Nil doesn’t accept.');
    return { audience, readers: readers as string[], key: key as string, at: at as number };
  },
};

export default docFacts;
