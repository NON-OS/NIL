// What scripts/calls/check.mjs does with its three people, in order. Ada sets the workspace up
// on a computer, Ana joins on a phone, and Ben joins on a computer whose server connection
// the check can tamper with.
import { api } from '../a11y/seed.mjs';
import sfuCall from './sfuCall.mjs';
import setup from './setup.mjs';
import probes from './probes.mjs';

const { until, links, sending, connected } = probes;

// a call control, which a phone keeps behind "More call controls"
async function control(p, name) {
  if (p.size === 'phone' && !['Mute', 'Unmute', 'Leave the call', 'Turn camera on', 'Turn camera off'].includes(name)) await p.page.getByRole('button', { name: 'More call controls' }).click();
  await p.page.getByRole('button', { name, exact: true }).click();
}


export default async function steps({ app, relay, ada, ana, ben, tamper, check, axe, shot, capture, sfu }) {
  await setup({ app, ada, ana, ben });
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
  // the relay can't read who speaks or moves: sound at a constant bitrate, every slot through
  // the padding worker, and the picture still arrives whole
  const shaped = (page) =>
    page.evaluate(() => {
      // Playwright's WebKit on Linux has no frame transforms at all; Safari has
      if (typeof RTCRtpScriptTransform === 'undefined' && !('createEncodedStreams' in RTCRtpSender.prototype)) return 'none';
      const live = window.__pcs.filter((pc) => pc.connectionState === 'connected');
      // Firefox has neither setting and drops both from descriptions; its sound is padded to one
      // size all the same, and it never pauses for silence
      const asked = (pc) => /firefox/i.test(navigator.userAgent) || (/cbr=1/.test(pc.remoteDescription?.sdp ?? '') && /usedtx=0/.test(pc.remoteDescription?.sdp ?? ''));
      const ok = live.every((pc) => asked(pc) && (pc.getConfiguration().encodedInsertableStreams === true || pc.getTransceivers().slice(0, 3).every((t) => t.sender.transform && t.receiver.transform)));
      return live.length && ok ? 'shaped' : 'not shaped';
    });
  const pictureOk = !capture || (await until('Ana’s picture on Ada’s side', async () => ada.page.evaluate(() => [...document.querySelectorAll('.call-tile video:not(.mirror)')].some((v) => v.videoWidth > 0)), 15_000).catch(() => false));
  const shaping = [await shaped(ada.page), await shaped(ana.page)];
  if (shaping.includes('none')) check('traffic shaping left out where the browser has no frame transforms', true);
  else check('browser-to-browser traffic is shaped: constant-bitrate sound, padded sound and video', shaping.every((x) => x === 'shaped') && Boolean(pictureOk), shaping.join(', '));

  // Ana mutes; Ada sees it. Without a microphone or camera there's nothing to mute.
  if (capture) {
    await ana.page.getByRole('button', { name: 'Mute', exact: true }).click();
    await until('Ana to show as muted', async () => (await ada.page.locator('.call-main [aria-label="Muted"]').count()) > 0, 10_000);
    check('muting shows on the other side', true);
    await ada.page.keyboard.press('Control+e');
    await until('Ada’s camera to be off', async () => (await ada.page.getByRole('button', { name: 'Turn camera on' }).count()) > 0, 5000);
    check('Ctrl+E turns the camera off', true);
    await ada.page.keyboard.press('Control+e');
    // the system takes the microphone, as a phone does in the background: the call says so, and
    // one tap brings it back
    const micLive = () => ada.page.evaluate(() => window.__pcs.flatMap((pc) => pc.getSenders()).some((x) => x.track?.kind === 'audio' && x.track.readyState === 'live'));
    await ada.page.evaluate(() => window.__pcs.flatMap((pc) => pc.getSenders()).forEach((x) => x.track?.kind === 'audio' && x.track.stop()));
    const said = await until('the call to say the microphone stopped', async () => (await ada.page.getByText(/Your microphone stopped/).count()) > 0, 10_000).catch(() => false);
    if (said) await ada.page.getByRole('button', { name: /back on/ }).click();
    const back = said && (await until('a live microphone again', micLive, 10_000).catch(() => false));
    check('a microphone the system took says so, and comes back with one tap', Boolean(back));
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

  // a dishonest server changes the sealed handshake on its way to Ben: Ben's browser refuses it
  tamper.on = true;
  await ada.page.goto(`${app.base}/calls`);
  await ada.page.getByRole('button', { name: 'Call Ben', exact: true }).click();
  await ben.page.getByRole('button', { name: 'Answer Ada with sound only' }).click();
  await until('Ben to refuse', async () => (await ben.page.getByRole('alert').filter({ hasText: 'changed on the way' }).count()) > 0, 30_000);
  check('the server can read none of what browsers in a call say to each other', tamper.seen > 0 && tamper.readable === 0, `${tamper.readable} of ${tamper.seen} readable`);
  check('a message changed on the way is refused', tamper.hits > 0, `${tamper.hits} messages tampered with`);
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
  // whether this browser hands a page a screen at all: headless Firefox refuses, as a person
  // cancelling would, and the app says nothing then
  const canShare = capture && (await ada.page.evaluate(() => Promise.race([navigator.mediaDevices.getDisplayMedia({ video: true }).then((m) => (m.getTracks().forEach((t) => t.stop()), 'ok'), (e) => e.name), new Promise((r) => setTimeout(() => r('no answer'), 5000))])));
  if (canShare !== 'ok') {
    check(`screen sharing left out where the browser can’t share a screen (${canShare || 'no capture'})`, true);
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
