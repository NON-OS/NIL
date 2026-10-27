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

const pictures = (page) => page.evaluate(() => [...document.querySelectorAll('.call-tile video:not(.mirror)')].filter((v) => v.videoWidth > 0).length);

// every connection to the SFU: its state, whether frames go through a transform, and its path
const sfuLinks = (page) =>
  page.evaluate(async () => {
    const out = [];
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue;
      const encrypted = pc.getConfiguration().encodedInsertableStreams === true || [...pc.getSenders(), ...pc.getReceivers()].filter((x) => x.track).every((x) => x.transform);
      const stats = await pc.getStats();
      let pair = null;
      stats.forEach((s) => {
        if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
      });
      stats.forEach((s) => {
        if (!pair && s.type === 'candidate-pair' && s.selected) pair = s;
      });
      out.push({ state: pc.connectionState, encrypted, local: pair && stats.get(pair.localCandidateId)?.candidateType });
    }
    return out;
  });

export default async function sfuCall({ ada, ana, ben, check }) {
  const all = [ada, ana, ben];
  for (const p of all) await until('the SFU connection', async () => (await sfuLinks(p.page)).some((l) => l.state === 'connected'));
  check('a call of three moves onto the SFU', true);
  // nobody's key is confirmed by everyone, so each says to go ahead for this call
  for (const p of all) {
    await p.page.waitForTimeout(500);
    // each click redraws the call, so press whichever is first until none is left
    for (let i = 0; i < 4 && (await p.page.getByRole('button', { name: 'Talk anyway' }).count()); i++) await p.page.getByRole('button', { name: 'Talk anyway' }).first().click();
    if (await p.page.getByRole('button', { name: 'Turn camera on' }).count()) await p.page.getByRole('button', { name: 'Turn camera on' }).click();
  }
  for (const p of all) await until(`${p.size} to see two pictures`, async () => (await pictures(p.page)) >= 2, 45_000);
  check('everyone sees the others’ pictures, decrypted only in their browsers', true);
  const links = (await Promise.all(all.map((p) => sfuLinks(p.page)))).flat().filter((l) => l.state === 'connected');
  check('every frame to and from the SFU is encrypted in the browser', links.length > 0 && links.every((l) => l.encrypted), JSON.stringify(links));
  check('and every path to the SFU goes through the relay', links.every((l) => l.local === 'relay'), JSON.stringify(links));

  // Ben leaves: Ada and Ana each make a new key he never gets, and still see each other
  await ben.page.getByRole('button', { name: 'Leave the call' }).click();
  await ada.page.waitForTimeout(4000);
  for (const p of [ada, ana]) await until(`${p.size} to see the other after the keys changed`, async () => (await pictures(p.page)) >= 1, 20_000);
  check('when someone leaves, the keys change and the call goes on', true);
  // and back in, he gets the new keys
  await ben.page.getByRole('button', { name: /Join call/ }).click();
  await ben.page.getByRole('button', { name: 'Join', exact: true }).click();
  for (let i = 0; i < 4 && (await ben.page.getByRole('button', { name: 'Talk anyway' }).count()); i++) await ben.page.getByRole('button', { name: 'Talk anyway' }).first().click();
  for (const p of [ada, ana]) for (let i = 0; i < 4 && (await p.page.getByRole('button', { name: 'Talk anyway' }).count()); i++) await p.page.getByRole('button', { name: 'Talk anyway' }).first().click();
  await until('Ben to see the others again', async () => (await pictures(ben.page)) >= 2, 45_000);
  check('someone who comes back gets the new keys', true);
}
