// Opens the comments beside the open doc, unless they are showing already.
export default async function showComments(page) {
  const toggle = page.getByRole('button', { name: 'Comments', exact: true });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await page.locator('aside.doc-side').waitFor();
  await page.waitForTimeout(2500);
}
