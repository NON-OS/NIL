import openDocs from '../lib/openDocs.mjs';

async function confirmOthers(page) {
  const check = page.getByRole('button', { name: 'Check keys' }).first();
  // nothing to confirm on a rerun, so the button doesn't come
  if (!(await check.waitFor({ timeout: 8000 }).then(() => true, () => false))) return;
  await check.click();
  const confirm = page.getByRole('button', { name: /^Confirm the key for/ });
  for (let n = 0; n < 8 && (await confirm.count()); n++) {
    await confirm.first().click();
    await page.waitForTimeout(500);
  }
  await page.keyboard.press('Escape');
}

// Everyone opens Docs once so they have a key, then confirms the others' keys, the way they'd
// compare fingerprints on a call. Last, each opens Docs again and waits, which is when their
// browser seals the team's keys to the people they confirmed.
export default async function confirmKeys(pages, base) {
  const everyone = Object.values(pages);
  for (const page of everyone) await openDocs(page, base);
  for (const page of everyone) {
    await openDocs(page, base);
    await confirmOthers(page);
  }
  for (const page of everyone) {
    await openDocs(page, base);
    await page.waitForTimeout(3000);
  }
}
