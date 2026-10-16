import fs from 'node:fs';

// One word per line, # starts a comment. Used for the name blocklist the operator maintains.
export default function readWordList(file, read) {
  if (!file) return [];
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim().toLowerCase())
      .filter(Boolean);
  } catch {
    read.fail(`CLOUD_BLOCKLIST_FILE points at ${file}, which can’t be read.`);
    return [];
  }
}
