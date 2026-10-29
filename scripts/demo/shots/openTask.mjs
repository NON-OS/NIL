import go from './go.mjs';

// Opens a task's drawer from the list.
export default async function openTask(page, base, title) {
  await go(page, base, '/list');
  await page.getByText(title, { exact: true }).first().click();
  await page.locator('.drawer, [role="dialog"]').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
}
