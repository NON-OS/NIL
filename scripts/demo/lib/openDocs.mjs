import unlock from './unlock.mjs';

// Loads Docs fresh and unlocks it, so the list is the server's latest.
export default async function openDocs(page, base) {
  await page.goto(`${base}/docs`);
  await unlock(page, '.docs');
}
