import openPage from '../lib/openPage.mjs';
import people from '../lib/people.mjs';
import saveState from '../lib/saveState.mjs';
import signIn from '../lib/signIn.mjs';
import step from '../lib/step.mjs';
import chat from './chat.mjs';
import confirmKeys from './confirmKeys.mjs';
import docThread from './docThread.mjs';
import files from './files.mjs';
import importDocs from './importDocs.mjs';

// The parts of part two, in the order they have to run: nobody can read a doc, a channel or a
// folder until the keys have gone round.
const PARTS = [
  ['keys', (pages, base) => confirmKeys(pages, base), 'keys confirmed and handed over'],
  ['docs', (pages, base) => importDocs(pages.ada, base), 'docs imported'],
  ['comments', (pages, base) => docThread(pages, base), 'a comment on the launch plan, and a reply'],
  ['chat', (pages, base) => chat(pages, base), 'channels and conversations'],
  ['files', (pages, base) => files(pages.ada, base), 'shared folders and files'],
];

// Part two, the end-to-end encrypted half, through the screens since only a browser holds the
// keys: key checks between the four, docs with a comment thread, chat, and shared files.
// `only` runs one part by name.
export default async function seedShared(browser, { base }, only) {
  const pages = {};
  for (const p of people) {
    pages[p.id] = await openPage(browser, p.id);
    await signIn(pages[p.id], base, p.id);
  }
  for (const [name, run, done] of PARTS) {
    if (only && only !== name) continue;
    await run(pages, base);
    step(done);
  }
  for (const p of people) {
    await saveState(pages[p.id], p.id);
    await pages[p.id].context().close();
  }
}
