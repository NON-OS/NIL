import statePath from './statePath.mjs';

// Keeps a person's sign-in, so the next script opens their browser already signed in.
export default function saveState(page, person) {
  return page.context().storageState({ path: statePath(person) });
}
