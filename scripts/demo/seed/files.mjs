import fs from 'node:fs';
import path from 'node:path';
import demoDir from '../lib/demoDir.mjs';
import openFiles from '../lib/openFiles.mjs';

const TYPES = { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf', csv: 'text/csv', webm: 'video/webm', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

// Each shared folder, who it's shared with (everyone unless named), its files, and folders inside it.
const FOLDERS = [
  {
    name: 'Design',
    files: ['Homepage hero v3.png', 'Palette 2.0.png', 'Atlas 2.0 brand guidelines.pdf'],
    inside: [
      { name: 'Onboarding', files: ['Onboarding 1 - Welcome to Atlas.png', 'Onboarding 2 - Back up your phrase.png', 'Onboarding 3 - Unlock with Face ID.png'] },
      { name: 'App icons', files: ['Atlas icon - light.png', 'Atlas icon - dark.png', 'Atlas icon - beta.png'] },
    ],
  },
  { name: 'Launch', files: ['Walkthrough draft.webm', 'Beta testers by country.csv'], inside: [] },
  { name: 'Lisbon offsite', files: ['Venue proposal - Lisbon.pdf', 'Venue - Palácio courtyard.jpg'], inside: [] },
  { name: 'Contracts', people: ['Dev Rao'], files: ['Mutual NDA - Helix Labs (signed).pdf', 'Offer letter - senior mobile engineer.docx'], inside: [] },
];

const item = (page, name) => page.locator('.files-tile, .files-row, .files-folder-card', { hasText: name });

async function newShared(page, name, people) {
  await page.getByRole('button', { name: 'New folder' }).first().click();
  await page.getByLabel('Name').fill(name);
  if (people) {
    await page.getByText('Specific people').click();
    for (const who of people) await page.locator('.share-person', { hasText: who }).click();
  }
  await page.getByRole('button', { name: 'Create folder' }).click();
}

// Opens a top-level shared folder, making it first if it isn't there.
async function top(page, base, { name, people }) {
  await openFiles(page, base);
  const card = page.locator('.files-folder-card', { hasText: name }).first();
  if (await card.count()) await card.locator('a, .files-open').first().click();
  else await newShared(page, name, people);
  await page.locator('.files-bar').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
}

async function subfolder(page, name) {
  if (await item(page, name).count()) return;
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await item(page, name).first().waitFor();
}

async function into(page, name) {
  await page.locator('.files-tile, .files-row', { hasText: name }).first().locator('.files-open').click();
  await page.waitForTimeout(800);
}

// A file handed to the browser as its bytes rather than its path: Chromium drops a path with an
// accent in it, like the courtyard photo's, when the machine has no UTF-8 locale set.
const payload = (name) => ({ name, mimeType: TYPES[name.split('.').pop()], buffer: fs.readFileSync(path.join(demoDir, 'assets', name)) });

// Uploads the files this folder doesn't show yet, all at once like a drag from the desktop.
async function put(page, files) {
  const missing = [];
  for (const f of files) if (!(await item(page, f.replace(/\.[^.]+$/, '')).count())) missing.push(f);
  if (!missing.length) return;
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await (await chooser).setFiles(missing.map(payload));
  await page.getByText(/Uploads finished/).waitFor({ timeout: 120000 });
  await page.waitForTimeout(800);
}

// Ada's shared folders, filled with the generated design files, documents and a video.
// Folders and files already there are kept as they are.
export default async function files(page, base) {
  for (const folder of FOLDERS) {
    await top(page, base, folder);
    for (const sub of folder.inside) await subfolder(page, sub.name);
    await put(page, folder.files);
    for (const sub of folder.inside) {
      await top(page, base, folder);
      await into(page, sub.name);
      await put(page, sub.files);
    }
  }
}
