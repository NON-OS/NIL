import api from '../lib/api.mjs';
import openPage from '../lib/openPage.mjs';
import people from '../lib/people.mjs';
import saveState from '../lib/saveState.mjs';
import signIn from '../lib/signIn.mjs';

async function create(page, { base, setupToken }) {
  await page.goto(base);
  await page.getByLabel('Setup token').fill(setupToken);
  await page.getByLabel('Workspace name').fill('Northwind');
  await page.getByLabel('Your name').fill('Ada Okafor');
  await page.getByText('Crypto team').click();
  await page.getByRole('button', { name: 'Create workspace with your wallet' }).click();
  await page.locator('.view-head h1').waitFor();
}

async function join(page, base, token, name) {
  await page.goto(`${base}/invite/${token}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join with your wallet' }).click();
  await page.locator('.view-head h1').waitFor();
}

// Ada makes the Northwind workspace through the setup screen and invites the others, who join
// with their own wallets. Anyone already in the workspace just signs in.
export default async function workspace(browser, server) {
  const { base } = server;
  const { needsSetup } = await fetch(`${base}/api/auth/state`).then((r) => r.json());
  const pages = { ada: await openPage(browser, 'ada') };
  if (needsSetup) await create(pages.ada, server);
  else await signIn(pages.ada, base, 'ada');
  await saveState(pages.ada, 'ada');
  const members = (await api(pages.ada, 'GET', '/bootstrap')).users.map((u) => u.name);
  for (const p of people.slice(1)) {
    pages[p.id] = await openPage(browser, p.id);
    if (members.includes(p.name)) await signIn(pages[p.id], base, p.id);
    else await join(pages[p.id], base, (await api(pages.ada, 'POST', '/invites', { role: 'member' })).token, p.name);
    await saveState(pages[p.id], p.id);
  }
  for (const p of people) await api(pages[p.id], 'PATCH', '/me', { name: p.name, title: p.title, color: p.color });
  const { users } = await api(pages.ada, 'GET', '/bootstrap');
  const uid = Object.fromEntries(people.map((p) => [p.id, users.find((u) => u.name === p.name).id]));
  return { pages, uid };
}
