import factChecks from './factChecks';

export interface DocUpdateFacts {
  // the hash of the doc key the change was sealed under (see keyHash)
  key: string;
  at: number;
}

// What the author of a live change signs next to it: which doc and which change it is, the key
// that protects it and when it was made.
const docUpdateFacts = {
  kind: 'nil/doc-update/v1',
  place: (docId: string, id: string) => [docId, 'update', id],
  list: (f: DocUpdateFacts) => [f.key, f.at],

  parse(list: unknown[]): DocUpdateFacts {
    const [key, at] = list;
    if (list.length !== 2 || !factChecks.hash(key) || !factChecks.time(at)) throw new Error('This change carries details Nil doesn’t accept.');
    return { key: key as string, at: at as number };
  },
};

export default docUpdateFacts;
