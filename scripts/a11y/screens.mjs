// The screens the accessibility check opens. Each is loaded cold, straight from its address, the
// way a bookmark or a shared link opens it, so a screen that leans on another screen's styles
// shows up too. `then` does what's needed after the load to reach a state worth checking, and
// `after` puts back anything it changed.

const openMenu = async (page) => {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.locator('.sidebar.open').waitFor();
};

const unlockDocs = async (page) => {
  await page.getByRole('button', { name: 'Unlock with your wallet' }).click();
  await page.locator('.docs').waitFor();
  const first = page.locator('.doc-link:not(.waiting)').first();
  if (await first.count()) await first.click();
  else await page.getByRole('button', { name: 'New doc' }).click();
  await page.locator('.doc-editor').waitFor();
};

// the network goes while the page is open, and the app is reloaded while it's gone
const loseNetwork = async (page) => {
  await page.context().setOffline(true);
  await page.locator('.offline-banner').waitFor();
};
const startOffline = async (page) => {
  await page.context().setOffline(true);
  await page.reload().catch(() => {});
  await page.getByRole('button', { name: 'Try now' }).waitFor();
};
const comeBack = (page) => page.context().setOffline(false);

// signed out: `ready` is something on the screen once it has loaded
const signedOut = [
  { name: 'sign-in', path: '/', ready: (page) => page.getByRole('button', { name: 'Sign in with your wallet' }) },
  { name: 'open-bounties', path: '/open', ready: (page) => page.getByRole('heading', { level: 1 }) },
  { name: 'help-signed-out', path: '/help', ready: (page) => page.locator('.help') },
  { name: 'verify-signed-out', path: '/verify', ready: (page) => page.getByRole('heading', { level: 1 }) },
];

// signed in as the workspace owner; a path can depend on what the seed made
const signedIn = [
  { name: 'my-work', path: '/' },
  { name: 'inbox', path: '/inbox' },
  { name: 'board', path: '/board' },
  { name: 'list', path: '/list' },
  { name: 'calendar', path: '/calendar' },
  { name: 'docs', path: '/docs' },
  { name: 'docs-open', path: '/docs', then: unlockDocs },
  { name: 'goals', path: '/goals' },
  { name: 'insights', path: '/insights' },
  { name: 'time', path: '/time' },
  { name: 'bounties', path: '/bounties' },
  { name: 'votes', path: '/votes' },
  { name: 'proofs', path: '/proofs' },
  { name: 'project', path: ({ project }) => `/projects/${project}` },
  { name: 'settings', path: '/settings' },
  { name: 'settings-security', path: '/settings?tab=security' },
  { name: 'help', path: '/help' },
  { name: 'task', path: '/board?task=1' },
  { name: 'menu', path: '/board', then: openMenu, phoneOnly: true },
  { name: 'offline-banner', path: '/board', then: loseNetwork, after: comeBack },
  { name: 'offline-start', path: '/board', then: startOffline, after: comeBack },
];

export default { signedOut, signedIn };
