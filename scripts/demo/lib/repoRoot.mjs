import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The checkout these scripts sit in, wherever it was cloned.
export default path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
