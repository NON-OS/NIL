import axe from './axe.mjs';
import pairPhone from './pairPhone.mjs';
import waitFor from '../chain/waitFor.mjs';

const signed = (phone, pattern) => phone.seen.filter((s) => s.kind === 'request' && s.method === 'personal_sign' && pattern.test(s.text ?? '')).length;
const signedIn = (page) => page.locator('.view-head h1').waitFor({ timeout: 120_000 });

// The live phone wallet check, in order; each step builds on the one before. Each returns the
// accessibility problems it saw, and throws on anything else that's wrong.
const steps = {
  // a fresh server: create the workspace with the phone, which also signs in
  async setUpWithPhone({ page, phone, app, watch }) {
    await page.goto(app.base);
    await page.getByLabel('Setup token').fill(app.setupToken);
    await page.getByLabel('Workspace name').fill('Phone check');
    await page.getByLabel('Your name').fill('Ada');
    const found = await pairPhone(page, phone, watch);
    // while the phone takes its time, the page says where to look
    await page.getByText('Confirm on your phone').waitFor({ timeout: 30_000 });
    found.push(...(await axe(page, 'confirm on your phone')));
    await signedIn(page);
    if (signed(phone, /^Create the Phone check workspace with this wallet\.$/m) !== 1) throw new Error('the phone wasn’t asked for exactly one sign-in signature');
    // WalletConnect keeps its records in Nil's own storage, never a database of its own
    const databases = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    if (databases.length) throw new Error(`the page made IndexedDB databases: ${databases.join(', ')}`);
    return found;
  },

  // a reload carries on with the same phone, and it sets up and unlocks the encryption keys
  async reloadThenUnlockKeys({ page, phone, app }) {
    const proposals = phone.seen.filter((s) => s.kind === 'proposal').length;
    await page.reload();
    await signedIn(page);
    await page.goto(`${app.base}/docs`);
    await page.getByRole('button', { name: 'Unlock with your wallet' }).click();
    await page.getByRole('button', { name: 'New doc' }).waitFor({ timeout: 180_000 });
    if (phone.seen.filter((s) => s.kind === 'proposal').length !== proposals) throw new Error('the reload asked the phone to connect again');
    if (signed(phone, /^Unlock my Nil encryption keys/m) !== 2) throw new Error('the unlock message wasn’t signed twice on the phone');
    if (signed(phone, /^Publish my Nil encryption keys/m) !== 1) throw new Error('the key statement wasn’t signed on the phone');
    return [];
  },

  // signing out tells the phone and leaves nothing of WalletConnect in the browser
  async signOutEndsTheSession({ page, phone }) {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('button', { name: 'Sign in with your wallet' }).waitFor();
    await waitFor(() => phone.ended.length > 0, { what: 'the phone to hear the session ended' });
    await waitFor(async () => (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('nonos:wc:')))).length === 0, { what: 'the browser to forget WalletConnect’s keys' });
    return [];
  },

  // and signing in again from the sign-in screen works the same way
  async signInWithPhone({ page, phone, watch }) {
    const found = await pairPhone(page, phone, watch);
    await signedIn(page);
    if (signed(phone, /^Sign in to Phone check\.$/m) !== 1) throw new Error('signing in again didn’t go through the phone');
    return found;
  },
};

export default steps;
