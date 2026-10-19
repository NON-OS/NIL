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

// overlays most screens share: quick add, search, a task's menu and the account menu
const quickAdd = async (page) => {
  await page.keyboard.press('c');
  await page.locator('.quickadd-input').waitFor();
};
const search = async (page) => {
  await page.keyboard.press('Control+k');
  await page.getByRole('listbox', { name: 'Results' }).waitFor();
};
const taskMenu = (page) => page.getByRole('button', { name: 'More actions' }).click();
const accountMenu = async (page) => {
  const toggle = page.getByRole('button', { name: 'Open menu' });
  if (await toggle.isVisible()) await openMenu(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
};

// the code a phone wallet scans, on a computer (phones keep their own way in)
const phoneCode = async (page) => {
  await page.getByRole('button', { name: 'Use a wallet on your phone' }).first().click();
  await page.getByRole('img', { name: 'Code for your phone wallet to scan' }).waitFor();
};
const closeDialog = (page) => page.keyboard.press('Escape');

// signed out: `ready` is something on the screen once it has loaded, `then` as signed in
const signedOut = [
  { name: 'sign-in', path: '/', ready: (page) => page.getByRole('button', { name: 'Sign in with your wallet' }) },
  { name: 'phone-wallet', path: '/', ready: (page) => page.getByRole('button', { name: 'Sign in with your wallet' }), then: phoneCode, desktopOnly: true },
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
  { name: 'phone-wallet-dialog', path: '/settings?tab=security', then: phoneCode, after: closeDialog, desktopOnly: true },
  { name: 'settings-team', path: '/settings?tab=team' },
  { name: 'help', path: '/help' },
  { name: 'task', path: '/board?task=1' },
  { name: 'task-visibility', path: '/board?task=1', then: (page) => page.getByTitle('Who can see this').click() },
  { name: 'menu', path: '/board', then: openMenu, phoneOnly: true },
  { name: 'quick-add', path: '/board', then: quickAdd },
  { name: 'search', path: '/board', then: search },
  { name: 'task-menu', path: '/board?task=1', then: taskMenu },
  { name: 'account-menu', path: '/', then: accountMenu },
  { name: 'offline-banner', path: '/board', then: loseNetwork, after: comeBack },
  { name: 'offline-start', path: '/board', then: startOffline, after: comeBack },
];

export default { signedOut, signedIn };
