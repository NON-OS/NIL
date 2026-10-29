import openDoc from '../lib/openDoc.mjs';
import showComments from '../lib/showComments.mjs';
import go from './go.mjs';
import openChannel from './openChannel.mjs';
import openDesign from './openDesign.mjs';
import openTask from './openTask.mjs';

// What a desktop screenshot needs a shortcut typed for: the quick add box and search.
async function typed(page, base, key, text) {
  await go(page, base, '/');
  await page.keyboard.press(key);
  await page.keyboard.type(text);
  await page.waitForTimeout(800);
}

async function project(page, base) {
  await go(page, base, '/');
  await page.locator('.nav-project, .sidebar a', { hasText: 'Atlas 2.0' }).first().click();
  await page.waitForTimeout(1500);
}

async function taskComments(page, base) {
  await openTask(page, base, 'Fix balance flicker on cold start');
  await page.locator('.drawer, [role="dialog"]').first().evaluate((el) => el.querySelector('.drawer-body, .drawer-scroll')?.scrollTo(0, 99999));
  await page.waitForTimeout(500);
}

// The desktop screenshots, as [name, how to reach the screen].
export default [
  ['my-work', (p, base) => go(p, base, '/')],
  ['inbox', (p, base) => go(p, base, '/inbox')],
  ['board', (p, base) => go(p, base, '/board')],
  ['list', (p, base) => go(p, base, '/list')],
  ['calendar', (p, base) => go(p, base, '/calendar')],
  ['project', project],
  ['task', (p, base) => openTask(p, base, 'Finish the onboarding flow redesign')],
  ['task-comments', taskComments],
  ['quick-add', (p, base) => typed(p, base, 'c', 'Review the hero copy with @Ben friday !high')],
  ['search', (p, base) => typed(p, base, 'Control+k', 'onboard')],
  ['goals', (p, base) => go(p, base, '/goals')],
  ['insights', (p, base) => go(p, base, '/insights')],
  ['time', (p, base) => go(p, base, '/time')],
  ['bounties', (p, base) => go(p, base, '/bounties')],
  ['votes', (p, base) => go(p, base, '/votes')],
  ['proofs', (p, base) => go(p, base, '/proofs')],
  ['docs', (p, base) => openDoc(p, base, 'Atlas 2.0 launch plan')],
  ['docs-comments', async (p, base) => (await openDoc(p, base, 'Atlas 2.0 launch plan'), showComments(p))],
  ['docs-notes', (p, base) => openDoc(p, base, 'Weekly sync')],
  ['chat', (p, base) => openChannel(p, base, 'atlas-launch')],
  ['chat-design', (p, base) => openChannel(p, base, 'design')],
  ['files', (p, base) => go(p, base, '/files', '.files-page')],
  ['files-design', (p, base) => openDesign(p, base)],
  ['files-onboarding', (p, base) => openDesign(p, base, 'Onboarding')],
  ['files-preview', (p, base) => openDesign(p, base, 'Homepage hero')],
  ['calls', (p, base) => go(p, base, '/calls')],
  ['settings', (p, base) => go(p, base, '/settings')],
  ['settings-team', (p, base) => go(p, base, '/settings?tab=team')],
  ['settings-security', (p, base) => go(p, base, '/settings?tab=security')],
];
