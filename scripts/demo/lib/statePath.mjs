import path from 'node:path';
import demoDir from './demoDir.mjs';

// Where one person's browser sign-in is kept between scripts.
export default function statePath(person) {
  return path.join(demoDir, `state-${person}.json`);
}
