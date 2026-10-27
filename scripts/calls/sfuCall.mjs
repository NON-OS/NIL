// The three-way call of scripts/calls/check.mjs once it's on the SFU: each person lets the others
// hear them, turns their camera on, and must see both others' pictures decoded, with every frame
// on every connection to the SFU going through the browser's own encryption, and every path
// through the relay.
const until = async (what, fn, ms = 30_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};

// Says "Talk anyway" to everyone held back on one screen, once at least `least` show up. Each
// click redraws the call, so it presses whichever comes first until none is left.
async function allow(p, least) {
  const button = () => p.page.getByRole('button', { name: 'Talk anyway' });
  await until(`${p.size} to show who it holds back`, async () => (await button().count()) >= least, 20_000);
  for (let i = 0; i < 6 && (await button().count()); i++) await button().first().click();
}

const pictures = (page) => page.evaluate(() => [...document.querySelectorAll('.call-tile video:not(.mirror)')].filter((v) => v.videoWidth > 0).length);

// every connection to the SFU: its state, whether frames go through a transform, and its path
const sfuLinks = (page) =>
  page.evaluate(async () => {
    const out = [];
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue;
      // Chromium encrypts through insertable streams, set up with the connection; Firefox and
      // Safari through a script transform on each sender and receiver that carries media. A
      // receiver counts once frames have arrived on it: Firefox keeps idle ones from the offer
      const stats = await pc.getStats();
      const receiving = new Set();
      stats.forEach((s) => {
        if (s.type === 'inbound-rtp' && s.bytesReceived > 0) receiving.add(s.mid ?? s.trackIdentifier);
      });
      const parts = pc.getTransceivers().filter((t) => !t.stopped && t.currentDirection && t.currentDirection !== 'inactive').flatMap((t) => [...(t.currentDirection.includes('send') && t.sender.track ? [t.sender] : []), ...(t.currentDirection.includes('recv') && (receiving.has(t.mid) || receiving.has(t.receiver.track?.id)) ? [t.receiver] : [])]);
      const encrypted = pc.getConfiguration().encodedInsertableStreams === true || (parts.length > 0 && parts.every((x) => x.transform));
      const missing = parts.filter((x) => !x.transform).map((x) => `${x.track?.kind}:${x instanceof RTCRtpSender ? 'send' : 'recv'}`);
      let pair = null;
      stats.forEach((s) => {
        if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
      });
      stats.forEach((s) => {
        if (!pair && s.type === 'candidate-pair' && s.selected) pair = s;
      });
      out.push({ state: pc.connectionState, encrypted, missing, local: pair && stats.get(pair.localCandidateId)?.candidateType });
    }
    return out;
  });

export default async function sfuCall({ ada, ana, ben, check }) {
  const all = [ada, ana, ben];
  for (const p of all) await until('the SFU connection', async () => (await sfuLinks(p.page)).some((l) => l.state === 'connected'));
  check('a call of three moves onto the SFU', true);
  // nobody's key is confirmed by everyone, so each says to go ahead for this call
  for (const p of all) {
    await allow(p, 1);
    if (await p.page.getByRole('button', { name: 'Turn camera on' }).count()) await p.page.getByRole('button', { name: 'Turn camera on' }).click();
  }
  for (const p of all) await until(`${p.size} to see two pictures`, async () => (await pictures(p.page)) >= 2, 45_000);
  check('everyone sees the others’ pictures, decrypted only in their browsers', true);
  const links = (await Promise.all(all.map((p) => sfuLinks(p.page)))).flat().filter((l) => l.state === 'connected');
  check('every frame to and from the SFU is encrypted in the browser', links.length > 0 && links.every((l) => l.encrypted), JSON.stringify(links));
  check('and every path to the SFU goes through the relay', links.every((l) => l.local === 'relay'), JSON.stringify(links));
  // every frame carries its sender's signed word for it: none of the real ones is taken for a fake
  await ada.page.waitForTimeout(5000);
  const doubted = (await Promise.all(all.map((p) => p.page.getByText(/Frames arrived in their name/).count()))).reduce((a, b) => a + b, 0);
  check('every frame checks out against its sender’s signed lists', doubted === 0 && (await pictures(ada.page)) >= 2);

  // Ben leaves: Ada and Ana each make a new key he never gets, and still see each other
  await ben.page.getByRole('button', { name: 'Leave the call' }).click();
  await ada.page.waitForTimeout(4000);
  for (const p of [ada, ana]) await until(`${p.size} to see the other after the keys changed`, async () => (await pictures(p.page)) >= 1, 20_000);
  check('when someone leaves, the keys change and the call goes on', true);
  // and back in, he gets the new keys
  await ben.page.getByRole('button', { name: /Join call/ }).click();
  await ben.page.getByRole('button', { name: 'Join', exact: true }).click();
  // Ben is new to this call again, so everyone says to go ahead again, and he does too
  for (const p of [ben, ada, ana]) await allow(p, 1);
  await until('Ben to see the others again', async () => (await pictures(ben.page)) >= 2, 45_000);
  check('someone who comes back gets the new keys', true);
}
