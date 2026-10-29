import makeAssets from '../assets/makeAssets.mjs';
import step from '../lib/step.mjs';
import seedShared from './seedShared.mjs';
import seedWork from './seedWork.mjs';

const SHARED = ['keys', 'docs', 'comments', 'chat', 'files'];
const PARTS = ['assets', 'work', ...SHARED];

// Fills the demo workspace: the files to upload, then part one (work through the API), then
// part two (the encrypted screens). `only` runs one part by name. Safe to run again.
export default async function seedAll(browser, server, only) {
  if (only && !PARTS.includes(only)) throw new Error(`No part called ${only}. Parts: ${PARTS.join(', ')}`);
  const wants = (part) => !only || only === part;
  if (wants('assets') || wants('files')) step(`files to upload, in ${await makeAssets(browser)}`);
  if (wants('work')) await seedWork(browser, server);
  if (!only || SHARED.includes(only)) await seedShared(browser, server, only);
}
