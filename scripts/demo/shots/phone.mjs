import openDoc from '../lib/openDoc.mjs';
import go from './go.mjs';
import openChannel from './openChannel.mjs';
import openDesign from './openDesign.mjs';
import openTask from './openTask.mjs';

async function menu(page, base) {
  await go(page, base, '/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.waitForTimeout(600);
}

// The phone screenshots, as [name, how to reach the screen].
export default [
  ['my-work', (p, base) => go(p, base, '/')],
  ['board', (p, base) => go(p, base, '/board')],
  ['task', (p, base) => openTask(p, base, 'Finish the onboarding flow redesign')],
  ['chat', (p, base) => openChannel(p, base, 'atlas-launch')],
  ['docs', (p, base) => openDoc(p, base, 'Atlas 2.0 launch plan')],
  ['files-design', (p, base) => openDesign(p, base)],
  ['menu', menu],
  ['insights', (p, base) => go(p, base, '/insights')],
];
