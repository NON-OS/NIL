import storage from '../lib/storage';
import keyScope from './keyScope';

// The highest version of each doc this browser has opened and verified, per workspace and
// account. Doc ids and numbers only. A server that later serves an older version than this is
// rolling the doc back, and the reader is told.
const slot = () => keyScope.slot('doc-versions');

const docVersions = {
  // Records a verified version; says whether it's older than one seen before.
  check(docId: string, version: number): 'ok' | 'rollback' {
    const here = slot();
    if (!here) return 'ok';
    const seen = storage.get<Record<string, number>>(here, {});
    if ((seen[docId] ?? 0) > version) return 'rollback';
    if (seen[docId] !== version) storage.set(here, { ...seen, [docId]: version });
    return 'ok';
  },
};

export default docVersions;
