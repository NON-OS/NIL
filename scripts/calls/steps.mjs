// What scripts/calls/check.mjs does with its three people, in order. Ada sets the workspace up
// on a computer, Ana joins on a phone, and Ben joins on a computer whose server connection
// the check can tamper with.
import { api } from '../a11y/seed.mjs';
import sfuCall from './sfuCall.mjs';

const until = async (what, fn, ms = 30_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

// each live peer connection's state and the kind of path it took
const links = (page) =>
  page.evaluate(async () => {
    const out = [];
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue;
      const stats = await pc.getStats();
      // Chromium and WebKit name the pair in use on the transport; Firefox marks it selected
      let pair = null;
      stats.forEach((s) => {
        if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
      });
      stats.forEach((s) => {
        if (!pair && s.type === 'candidate-pair' && s.selected) pair = s;
      });
      out.push({ state: pc.connectionState, local: pair && stats.get(pair.localCandidateId)?.candidateType, remote: pair && stats.get(pair.remoteCandidateId)?.candidateType });
    }
    return out;
  });

// a call control, which a phone keeps behind "More call controls"
async function control(p, name) {
  if (p.size === 'phone' && !['Mute', 'Unmute', 'Leave the call', 'Turn camera on', 'Turn camera off'].includes(name)) await p.page.getByRole('button', { name: 'More call controls' }).click();
  await p.page.getByRole('button', { name, exact: true }).click();
}

// the kind of each track every live connection sends, or null for a slot sending nothing
const sending = (page) => page.evaluate(() => window.__pcs.filter((pc) => pc.connectionState !== 'closed').flatMap((pc) => pc.getSenders().map((s) => s.track?.kind ?? null)));

const connected = (page, n) => until(`${n} connected peer connections`, async () => (await links(page)).filter((l) => l.state === 'connected').length >= n && (await links(page)));

export default async function steps({ app, relay, ada, ana, ben, tamper, check, axe, shot, capture, sfu }) {
  // Ada makes the workspace; Ana and Ben join with invites; each unlocks their keys
  await ada.wallet(ada.key);
  await ada.page.goto(app.base);
  await ada.page.getByLabel('Setup token').fill(app.setupToken);
  await ada.page.getByLabel('Workspace name').fill('Northwind');
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
  await axe(ada.page, 'Calls page, desktop');
  await axe(ana.page, 'Calls page, phone');
  await shot(ada.page, 'calls-page-desktop');

  // a video call from Ada to Ana, answered on Ana's phone
  // Ana's keys reach Ada's list live, once Ana has unlocked
  await until('Ana to be callable', () => ada.page.getByRole('button', { name: 'Video call Ana' }).isEnabled());
  await ada.page.getByRole('button', { name: 'Video call Ana' }).click();
  await ana.page.getByRole('button', { name: 'Answer Ada with video' }).click();
  await ana.page.locator('.call-screen').waitFor({ timeout: 15_000 }).catch(async () => {
    throw new Error(`Ana's call screen didn't open: ${await ana.page.locator('.toast').allTextContents()}`);
  });
  const pair = await connected(ada.page, 1);
  await connected(ana.page, 1);
  check('a one-to-one video call connects', true);
  check('it goes through the relay and nowhere else', relay ? pair.every((l) => l.local === 'relay' && l.remote === 'relay') : true, JSON.stringify(pair));
  if (capture) await until('Ana’s video on Ada’s screen', () => ada.page.locator('.call-main video').count());
  await ada.page.waitForTimeout(1500);
  check('Ana shows as unverified to Ada until Ada confirms her key', (await ada.page.getByRole('button', { name: /Unverified: check Ana/ }).count()) === 1);
  await shot(ada.page, 'call-duo-desktop');
  await shot(ana.page, 'call-duo-phone');
  await axe(ada.page, 'call screen, desktop');
  await axe(ana.page, 'call screen, phone');

  // neither has confirmed the other's key, so neither sends a thing until they choose to
  check('nothing goes to a teammate whose key isn’t confirmed', (await sending(ada.page)).every((t) => t === null) && (await sending(ana.page)).every((t) => t === null), JSON.stringify(await sending(ada.page)));
  check('and the call says so', (await ada.page.getByText(/can’t see or hear you yet/).count()) > 0);

  // the same "check their keys" flow as Docs; a confirmed key starts the sound and picture
  await ada.page.getByRole('button', { name: /Unverified: check Ana/ }).click();
  await ada.page.getByRole('button', { name: /Confirm the key for Ana/ }).click();
  await until('the badge to say confirmed', async () => (await ada.page.getByText('Key confirmed').count()) > 0);
  check('confirming the key turns the badge to confirmed', true);
  if (capture) await until('Ada to send to Ana', async () => (await sending(ada.page)).includes('audio'), 5000);
  check('and Ada’s sound and picture start going to Ana', !capture || (await sending(ada.page)).includes('audio'));
  // Ana goes ahead without checking, for this call
  await ana.page.getByRole('button', { name: 'Talk anyway' }).click();
  if (capture) await until('Ana to send to Ada', async () => (await sending(ana.page)).includes('audio'), 5000);
  check('“Talk anyway” starts sending for this call only', !capture || (await sending(ana.page)).includes('audio'));

  // Ana mutes; Ada sees it. Without a microphone or camera there's nothing to mute.
  if (capture) {
    await ana.page.getByRole('button', { name: 'Mute', exact: true }).click();
    await until('Ana to show as muted', async () => (await ada.page.locator('.call-main [aria-label="Muted"]').count()) > 0, 10_000);
    check('muting shows on the other side', true);
    await ada.page.keyboard.press('Control+e');
    await until('Ada’s camera to be off', async () => (await ada.page.getByRole('button', { name: 'Turn camera on' }).count()) > 0, 5000);
    check('Ctrl+E turns the camera off', true);
    await ada.page.keyboard.press('Control+e');
  } else {
    check('a call connects with no microphone or camera at all', true);
  }

  // the relay goes away mid-call and comes back: the call recovers with an ICE restart
  if (relay) {
    relay.kill();
    await until('the call to notice', async () => (await ada.page.getByText(/Reconnecting|Connection lost/).count()) > 0, 60_000);
    check('a dropped relay shows as reconnecting', true);
    await relay.start();
    const start = Date.now();
    await until('the call to come back', async () => (await ada.page.getByText(/Reconnecting|Connection lost/).count()) === 0 && (await links(ada.page)).some((l) => l.state === 'connected'), 90_000);
    check('the call recovers once the relay is back', true, `${((Date.now() - start) / 1000).toFixed(1)} s after it came back`);
    await shot(ana.page, 'call-recovered-phone');
  }

  // Ana hangs up; a call with one person ends for Ada too
  await ana.page.getByRole('button', { name: 'Leave the call' }).click();
  await until('Ada’s call to end', async () => (await ada.page.locator('.call-screen, .call-dock').count()) === 0, 15_000);
  check('hanging up ends a one-to-one call on both sides', true);

  // a dishonest server swaps the fingerprint on its way to Ben: Ben's browser refuses it
  tamper.on = true;
  await ada.page.goto(`${app.base}/calls`);
  await ada.page.getByRole('button', { name: 'Call Ben', exact: true }).click();
  await ben.page.getByRole('button', { name: 'Answer Ada with sound only' }).click();
  await until('Ben to refuse', async () => (await ben.page.getByRole('alert').filter({ hasText: 'changed on the way' }).count()) > 0, 30_000);
  check('a swapped fingerprint is refused', tamper.hits > 0, `${tamper.hits} descriptions tampered with`);
  await until('Ada to hear of it', async () => (await ada.page.getByRole('alert').filter({ hasText: 'refused it' }).count()) > 0, 15_000);
  check('the other side is told the connection was refused', true);
  check('no media flowed', (await links(ben.page)).every((l) => l.state !== 'connected'));
  await shot(ben.page, 'call-refused-desktop');
  await ben.page.getByRole('button', { name: 'Leave the call' }).click();
  await ada.page.getByRole('button', { name: 'Leave the call' }).click().catch(() => {});
  tamper.on = false;

  // a project call with all three
  const { project } = await api(ada.page, 'POST', '/projects', { name: 'Launch', color: '#007c85' });
  await ada.page.goto(`${app.base}/projects/${project.id}`);
  await ada.page.getByRole('button', { name: 'Start a call for this project' }).click();
  await ada.page.locator('.call-screen').waitFor();
  for (const p of [ana, ben]) {
    await p.page.goto(`${app.base}/projects/${project.id}`);
    await p.page.getByRole('button', { name: /Join call/ }).click();
    await p.page.getByRole('button', { name: 'Join', exact: true }).click();
  }
  if (sfu) {
    await sfuCall({ ada, ana, ben, check });
  } else {
    const three = await connected(ada.page, 2);
    await connected(ana.page, 2);
    await connected(ben.page, 2);
    check('three people connect in a project call', true);
    check('every path in it is relayed', relay ? three.every((l) => l.local === 'relay' && l.remote === 'relay') : true, JSON.stringify(three));
  }
  await ada.page.waitForTimeout(1500);
  await shot(ada.page, 'call-group-desktop');
  await shot(ana.page, 'call-group-phone');
  await axe(ana.page, 'group call, phone');
  await ada.page.keyboard.press('l');
  await ada.page.waitForTimeout(500);
  await shot(ada.page, 'call-speaker-desktop');
  await axe(ada.page, 'speaker layout, desktop');

  // a shared screen, where the browser can share one without asking
  // where the browser offers screen sharing at all; headless Firefox and WebKit don't
  if (!capture) {
    check('screen sharing left out where the browser can’t capture anything', true);
  } else if (await ada.page.getByRole('button', { name: 'Share your screen' }).count()) {
    await ada.page.getByRole('button', { name: 'Share your screen' }).click();
    const shared = await until('Ada’s screen on Ben’s side', async () => (await ben.page.locator('figure[aria-label="Ada’s screen"]').count()) > 0, 10_000).catch(() => false);
    // headless Firefox has no screen to share, and says so
    const noScreen = !shared && (await ada.page.getByText('No screen was found.').count()) > 0;
    check(noScreen ? 'with no screen to share, the app says so' : 'a shared screen reaches the others', Boolean(shared) || noScreen);
    if (shared) {
      await ben.page.waitForTimeout(1500);
      await shot(ben.page, 'call-screen-share-desktop');
    }
  } else {
    check('no share button where the browser can’t share a screen', true);
  }

  // minimized, the call keeps going in a dock
  await control(ana, 'Minimize the call');
  await shot(ana.page, 'call-dock-phone');
  await axe(ana.page, 'call dock, phone');
  for (const p of [ana, ben, ada]) await p.page.getByRole('button', { name: 'Leave the call' }).click();
  const left = await until('the server to forget the call', async () => (await api(ada.page, 'GET', '/calls')).calls.length === 0, 10_000).catch(() => false);
  check('once everyone leaves, the server keeps nothing about the call', Boolean(left));
}
