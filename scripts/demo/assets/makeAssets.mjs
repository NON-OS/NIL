import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import demoDir from '../lib/demoDir.mjs';
import repoRoot from '../lib/repoRoot.mjs';
import catalog from './catalog.mjs';
import record from './record.mjs';

async function image(browser, { file: name, image: html, size: [width, height], scale, clear }, file) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  await page.setContent(html);
  const jpeg = name.endsWith('.jpg');
  await page.screenshot({ path: file, type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 86 : undefined, omitBackground: Boolean(clear) });
  await context.close();
}

async function pdf(browser, html, file) {
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  await page.close();
}

function word(file) {
  const loader = path.join(repoRoot, 'scripts/test/registerTs.mjs');
  const args = ['--disable-warning=ExperimentalWarning', '--experimental-strip-types', '--import', loader, path.join(repoRoot, 'scripts/demo/assets/offerLetter.mjs'), file];
  const run = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
  if (run.status !== 0) throw new Error('Writing the offer letter failed');
}

function make(browser, entry, file) {
  if (entry.image) return image(browser, entry, file);
  if (entry.pdf) return pdf(browser, entry.pdf, file);
  if (entry.video) return record(browser, entry.video, file, entry.ms);
  if (entry.word) return word(file);
  fs.writeFileSync(file, entry.text);
}

// Makes the files the seed uploads, into the demo folder, so the repository carries the recipes
// and none of the binaries. Files made on an earlier run are kept; each is written under a
// temporary name first, so one cut short is made again next time. Returns the folder.
export default async function makeAssets(browser) {
  const dir = path.join(demoDir, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  for (const entry of catalog) {
    const file = path.join(dir, entry.file);
    if (fs.existsSync(file)) continue;
    await make(browser, entry, `${file}.part`);
    fs.renameSync(`${file}.part`, file);
  }
  return dir;
}
