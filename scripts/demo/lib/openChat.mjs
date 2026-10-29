import unlock from './unlock.mjs';

// Loads Chat fresh and unlocks it. Channel names are encrypted, so it waits a moment for the
// list to read before anyone looks for a channel by name.
export default async function openChat(page, base) {
  await page.goto(`${base}/chat`);
  await unlock(page, '.chat, .empty');
  await page.waitForTimeout(1500);
}
