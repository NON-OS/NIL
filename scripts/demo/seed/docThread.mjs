import openDoc from '../lib/openDoc.mjs';
import showComments from '../lib/showComments.mjs';

const DOC = 'Atlas 2.0 launch plan';
const QUESTION = 'Can we confirm the date with the App Store review times first? Last time it took four days.';
const ANSWER = 'Checked: three days on average this year. Submitting on the 3rd leaves room.';

const thread = (page) => page.locator('article.doc-thread', { hasText: QUESTION.slice(0, 40) }).first();

// Ada comments on the first line of the plan.
async function ask(page) {
  await page.locator('.doc-prose p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await page.getByLabel('Comment', { exact: true }).fill(QUESTION);
  await page.getByRole('button', { name: 'Comment', exact: true }).last().click();
  await thread(page).waitFor();
}

async function answer(page) {
  const card = thread(page);
  await card.getByLabel('Reply').fill(ANSWER);
  await card.getByRole('button', { name: 'Reply', exact: true }).click();
  await card.getByText(ANSWER.slice(0, 40)).waitFor();
}

// Ada asks about the launch date in a comment on the launch plan and Ben replies. Each looks for
// their words first, so a rerun leaves one thread with one reply.
export default async function docThread(pages, base) {
  await openDoc(pages.ada, base, DOC);
  await showComments(pages.ada);
  if (!(await thread(pages.ada).count())) {
    await ask(pages.ada);
    await pages.ada.waitForTimeout(2500);
  }
  await openDoc(pages.ben, base, DOC);
  await showComments(pages.ben);
  await thread(pages.ben).waitFor({ timeout: 30000 });
  if (await thread(pages.ben).getByText(ANSWER.slice(0, 40)).count()) return;
  await answer(pages.ben);
  await pages.ben.waitForTimeout(2500);
}
