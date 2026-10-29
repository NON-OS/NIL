import addressOf from '../lib/addressOf.mjs';
import api from '../lib/api.mjs';
import keys from '../lib/keys.mjs';
import step from '../lib/step.mjs';

// A signed ballot, the way the app casts one: the server writes the text, the wallet signs it.
async function vote(page, who, id, choice) {
  const { ballotId, message } = await api(page, 'POST', `/proposals/${id}/ballot`, { choice });
  const hex = `0x${Buffer.from(message, 'utf8').toString('hex')}`;
  const signature = await page.evaluate((h) => window.ethereum.request({ method: 'personal_sign', params: [h] }), hex);
  await api(page, 'POST', `/proposals/${id}/vote`, { ballotId, signature, address: addressOf(keys()[who]) });
}

// Three votes: one open with everyone in, one closed with a result, and one nobody has cast yet.
export default async function votes({ pages }) {
  const propose = async (body) => (await api(pages.ada, 'POST', '/proposals', body)).proposal.id;
  const dates = await propose({ title: 'Dates for the Lisbon offsite', body: 'Pick the dates that work for you. The venue holds both weekends until Friday.', options: ['12 to 14 March', '19 to 21 March', '26 to 28 March'], days: 5 });
  for (const [who, choice] of [['ada', 1], ['ben', 1], ['cleo', 0], ['dev', 1]]) await vote(pages[who], who, dates, choice);
  const palette = await propose({ title: 'Adopt the new colour palette for 2.0', body: 'The palette from the brand update, used across the app and the site.', options: ['Yes', 'No', 'Abstain'], days: 3 });
  for (const [who, choice] of [['ada', 0], ['ben', 0], ['cleo', 0], ['dev', 2]]) await vote(pages[who], who, palette, choice);
  await api(pages.ada, 'POST', `/proposals/${palette}/close`).catch((e) => step(`closing the palette vote: ${e.message}`));
  await propose({ title: 'Move the weekly sync to Tuesdays', options: ['Yes', 'No'], days: 7 });
}
