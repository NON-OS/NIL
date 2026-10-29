import go from './go.mjs';

// Opens a chat channel and waits for its conversation to decrypt.
export default async function openChannel(page, base, name) {
  await go(page, base, '/chat', '.chat, .empty');
  await page.locator('.chat-link', { hasText: name }).first().click();
  await page.locator('.msg').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2000);
}
