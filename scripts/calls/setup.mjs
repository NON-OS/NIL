// The calls check's three people: Ada makes the workspace, Ana and Ben join with invites, and
// each unlocks their keys on the Calls page.
import { api } from '../a11y/seed.mjs';

export default async function setup({ app, ada, ana, ben }) {
  await ada.wallet(ada.key);
  await ada.page.goto(app.base);
  await ada.page.getByLabel('Setup token').fill(app.setupToken);
  await ada.page.getByLabel('Workspace name').fill('Atlas');
  await ada.page.getByLabel('Your name').fill('Ada');
  await ada.page.getByRole('button', { name: 'Create workspace with your wallet' }).click();
  await ada.page.locator('.view-head h1').waitFor();
  for (const [p, name] of [
    [ana, 'Ana'],
    [ben, 'Ben'],
  ]) {
    const { token } = await api(ada.page, 'POST', '/invites', { role: 'member' });
    await p.wallet(p.key);
    await p.page.goto(`${app.base}/invite/${token}`);
    await p.page.getByLabel('Your name').fill(name);
    await p.page.getByRole('button', { name: 'Join with your wallet' }).click();
    await p.page.locator('.view-head h1').waitFor();
  }
  for (const p of [ada, ana, ben]) {
    await p.page.goto(`${app.base}/calls`);
    await p.page.getByRole('button', { name: 'Unlock your keys' }).click();
    await p.page.getByRole('button', { name: 'Unlock your keys' }).waitFor({ state: 'detached', timeout: 30_000 });
  }
}
